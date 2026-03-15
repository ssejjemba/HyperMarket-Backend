import type { FastifyInstance, FastifyRequest } from 'fastify';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { otpSink } from '@hypermarket/core/dev/otpSink';

type DevOtpParams = {
  challenge_id: string;
};

type DevOtpResponse = {
  challenge_id: string;
  otp_code: string;
  expires_at: string;
};

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1']);

const assertLocalRequest = (request: FastifyRequest): void => {
  if (!LOCAL_ADDRESSES.has(request.ip)) {
    throw new AppError({
      code: ErrorCode.DevForbidden,
      message: 'Dev OTP routes are only available from localhost'
    });
  }
};

export const registerDevRoutes = (server: FastifyInstance<any, any, any, any>): void => {
  server.get<{ Params: DevOtpParams }>(
    '/__dev/otp/:challenge_id',
    async (request): Promise<DevOtpResponse> => {
      assertLocalRequest(request);

      const entry = otpSink.get(request.params.challenge_id);
      if (entry === null) {
        throw new AppError({
          code: ErrorCode.DevOtpNotFound,
          message: 'OTP not found for challenge'
        });
      }

      return {
        challenge_id: request.params.challenge_id,
        otp_code: entry.otpCode,
        expires_at: entry.expiresAt.toISOString()
      };
    }
  );
};
