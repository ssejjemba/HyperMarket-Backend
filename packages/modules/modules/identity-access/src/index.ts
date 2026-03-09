import type { FastifyInstance } from 'fastify';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { runInTransaction } from '@hypermarket/core/db';

import type { ModuleDeps } from '../../../src/types';
import { normalizePhone } from './phone/normalizePhone';
import { createOtpService } from './otp/otpService';
import { createUserRepository } from './user/userRepository';
import { createSessionService } from './session/sessionService';
import { createMembershipAdapter } from './membership/tenancyAdapter';

const getBearerToken = (authorization?: string): string | null => {
  if (authorization === undefined) {
    return null;
  }

  const parts = authorization.split(' ');
  if (parts.length !== 2) {
    return null;
  }

  const scheme = parts[0];
  const token = parts[1];
  if (scheme === undefined || token === undefined) {
    return null;
  }

  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
};

const requireField = (value: string | undefined, field: string): string => {
  if (value === undefined || value.length === 0) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: `${field} is required`
    });
  }

  return value;
};

export const registerRoutes = async (server: FastifyInstance, deps: ModuleDeps): Promise<void> => {
  const otpService = createOtpService({
    otpSecret: deps.config.otpSecret,
    ttlSeconds: deps.config.otpTtlSeconds,
    isDev: deps.config.nodeEnv !== 'production'
  });
  const userRepo = createUserRepository(deps.db);
  const sessionService = createSessionService(deps.db, {
    jwtSecret: deps.config.jwtSecret,
    jwtIssuer: deps.config.jwtIssuer,
    ttlSeconds: deps.config.sessionTtlSeconds
  });
  const membership = createMembershipAdapter(deps.db);

  server.post('/auth/otp/request', async (request) => {
    const payload = request.body as { phone?: string };
    const phoneRaw = requireField(payload?.phone, 'phone');
    const phone = normalizePhone(phoneRaw);

    const { otpId, code } = await runInTransaction(deps.db, (trx) =>
      otpService.requestOtp(trx, phone)
    );

    if (deps.config.nodeEnv !== 'production') {
      deps.logger.info({ otpId, phone, code }, 'OTP generated (dev)');
    }

    return {
      otp_id: otpId,
      ...(deps.config.nodeEnv !== 'production' ? { otp_code: code } : {})
    };
  });

  server.post('/auth/otp/verify', async (request) => {
    const payload = request.body as { phone?: string; code?: string };
    const phoneRaw = requireField(payload?.phone, 'phone');
    const code = requireField(payload?.code, 'code');
    const phone = normalizePhone(phoneRaw);

    const user = await runInTransaction(deps.db, async (trx) => {
      await otpService.verifyOtp(trx, phone, code);

      const existing = await userRepo.findByPhone(phone);
      if (existing !== null) {
        return existing;
      }

      return userRepo.createUser(phone);
    });

    const { token, session } = await sessionService.issueSession(user.id, user.phoneE164);

    return {
      token,
      session: {
        id: session.id,
        expires_at: session.expiresAt
      },
      user: {
        id: user.id,
        phone: user.phoneE164
      }
    };
  });

  server.get('/auth/session', async (request) => {
    const token = getBearerToken(request.headers.authorization);
    if (token === null) {
      throw new AppError({
        code: ErrorCode.Unauthorized,
        message: 'Authorization required'
      });
    }

    const payload = await sessionService.verifyToken(token);
    if (payload.sub.length === 0) {
      throw new AppError({
        code: ErrorCode.Unauthorized,
        message: 'Invalid session'
      });
    }

    const tenants = await membership.listTenantsForUser(payload.sub);

    return {
      user: {
        id: payload.sub,
        phone: payload.phone
      },
      tenants
    };
  });
};
