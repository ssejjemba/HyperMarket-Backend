import Fastify from 'fastify';
import type { Kysely } from 'kysely';
import pino from 'pino';

import { AppError, ErrorCode, errorToHttp } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';

import { registerIaaApiRoutes } from './api/routes';
import type { IaaApiDeps } from './api/routes';
import { createTenancyMembershipAdapter } from './membership/TenancyMembershipAdapter';
import type { MembershipReader } from './membership/MembershipReader';
import { OtpChallengePolicy } from './otp/domain/OtpChallengePolicy';
import type { OtpRequestRateLimiter } from './otp/integrations/OtpRequestRateLimiter';
import type { OtpVerificationProvider } from './otp/integrations/OtpVerificationProvider';
import { createOtpChallengeRepoPg } from './otp/persistence/OtpChallengeRepoPg';
import { createOtpChallengeService } from './otp/OtpChallengeService';
import { createRequestOtpUseCase } from './otp/application/RequestOtpUseCase';
import type { RequestOtpUseCase } from './otp/application/RequestOtpUseCase';
import { createVerifyOtpUseCase } from './otp/application/VerifyOtpUseCase';
import type { VerifyOtpUseCase } from './otp/application/VerifyOtpUseCase';
import { createLogoutAllUseCase } from './session/application/LogoutAllUseCase';
import { createLogoutUseCase } from './session/application/LogoutUseCase';
import { createSessionService } from './session/SessionService';
import type { SessionService } from './session/SessionService';
import { createSessionRepoPg } from './session/persistence/SessionRepoPg';
import { createTokenSigner } from './session/TokenSigner';
import { createUserRepoPg } from './user/persistence/UserRepoPg';
import { createUserService } from './user/UserService';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export const TEST_JWT_SECRET = 'test-jwt-secret-minimum-32-chars!!';

const silentLogger = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// Full-stack test server (requires a real DB for OTP/user flows)
// ---------------------------------------------------------------------------

export type IaaApiTestServerParams = {
  /** Kysely instance pointed at the test database. */
  db: Kysely<DatabaseSchema>;
  /** Defaults to a stub that approves the code "123456". */
  verificationProvider?: OtpVerificationProvider | undefined;
  rateLimiter?: OtpRequestRateLimiter | undefined;
  jwtSecret?: string | undefined;
  sessionTtlSeconds?: number | undefined;
  otpTtlSeconds?: number | undefined;
  resendCooldownSeconds?: number | undefined;
  maxAttempts?: number | undefined;
  rateLimitWindowSeconds?: number | undefined;
  rateLimitMaxChallengesPerPhone?: number | undefined;
};

/**
 * Build a Fastify test server wired to a real Postgres DB.
 * Use this for OTP request/verify flow tests.
 * Returns the server plus the JWT signer so tests can mint valid tokens.
 */
export const buildIaaApiTestServer = async (params: IaaApiTestServerParams) => {
  const jwtSecret = params.jwtSecret ?? TEST_JWT_SECRET;
  const sessionTtlSeconds = params.sessionTtlSeconds ?? 3600;
  const otpTtlSeconds = params.otpTtlSeconds ?? 300;
  const resendCooldownSeconds = params.resendCooldownSeconds ?? 60;
  const maxAttempts = params.maxAttempts ?? 3;
  const rateLimitWindowSeconds = params.rateLimitWindowSeconds ?? 3600;
  const rateLimitMaxChallengesPerPhone = params.rateLimitMaxChallengesPerPhone ?? 5;

  const policy = new OtpChallengePolicy({
    challengeTtlSeconds: otpTtlSeconds,
    resendCooldownSeconds,
    maxAttempts,
    phoneRateLimitBurstWindowSeconds: rateLimitWindowSeconds,
    phoneRateLimitBurstMaxChallenges: rateLimitMaxChallengesPerPhone,
    phoneRateLimitDailyWindowSeconds: 86_400,
    phoneRateLimitDailyMaxChallenges: 10,
    ipRateLimitWindowSeconds: 600,
    ipRateLimitMaxChallenges: 20
  });

  const verificationProvider =
    params.verificationProvider ??
    ({
      startVerification: async () => ({ provider: 'test' }),
      checkVerification: async ({ code }) => ({
        approved: code === '123456',
        provider: 'test'
      })
    } satisfies OtpVerificationProvider);
  const rateLimiter =
    params.rateLimiter ??
    ({
      checkPhone: async () => ({ allowed: true }),
      checkIp: async () => ({ allowed: true })
    } satisfies OtpRequestRateLimiter);

  const otpRepo = createOtpChallengeRepoPg(params.db);
  const userRepo = createUserRepoPg(params.db);
  const sessionRepo = createSessionRepoPg(params.db);
  const membershipReader = createTenancyMembershipAdapter(params.db);

  const otpService = createOtpChallengeService({
    repo: otpRepo,
    verificationProvider,
    rateLimiter,
    policy,
    logger: silentLogger
  });

  const userService = createUserService({ repo: userRepo });

  const tokenSigner = createTokenSigner({ secret: jwtSecret, ttlSeconds: sessionTtlSeconds });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: sessionTtlSeconds
  });
  const logoutUseCase = createLogoutUseCase({
    db: params.db,
    sessionService,
    membershipReader
  });
  const logoutAllUseCase = createLogoutAllUseCase({
    db: params.db,
    sessionService,
    membershipReader
  });

  const requestOtpUseCase = createRequestOtpUseCase({ otpService, logger: silentLogger });
  const verifyOtpUseCase = createVerifyOtpUseCase({
    otpService,
    userService,
    sessionService,
    membershipReader,
    logger: silentLogger
  });

  const server = await buildServerWithDeps({
    logger: silentLogger,
    requestOtpUseCase,
    verifyOtpUseCase,
    logoutUseCase,
    logoutAllUseCase,
    sessionService,
    membershipReader
  });

  return { server, tokenSigner, otpRepo, sessionRepo };
};

// ---------------------------------------------------------------------------
// Stub test server (no DB — for schema validation and JWT tests)
// ---------------------------------------------------------------------------

/**
 * Build a lightweight Fastify test server with:
 * - Stub OTP use cases (never hit DB; return 501 for OTP endpoints)
 * - Real JWT session service (pure crypto, no DB)
 * - Empty membership reader
 *
 * Use this for schema validation tests and session token validation tests.
 */
export const buildIaaStubTestServer = async (
  overrides: Partial<IaaApiDeps> & { jwtSecret?: string; sessionTtlSeconds?: number } = {}
) => {
  const jwtSecret = overrides.jwtSecret ?? TEST_JWT_SECRET;
  const sessionTtlSeconds = overrides.sessionTtlSeconds ?? 3600;

  const tokenSigner = createTokenSigner({ secret: jwtSecret, ttlSeconds: sessionTtlSeconds });
  const sessionService: SessionService =
    overrides.sessionService ??
    ({
      issueSession: async (user) => {
        const { token, expiresAt } = await tokenSigner.sign(user.id, 'stub-session');
        return { accessToken: token, expiresAt };
      },
      validateSession: async (token) => {
        if (token === undefined || token === null || token.trim() === '') {
          throw new AppError({
            code: ErrorCode.AuthMissingToken,
            message: 'Authorization token is required'
          });
        }

        const claims = await tokenSigner.verify(token);
        return { userId: claims.userId, sessionId: claims.sessionId };
      }
    } satisfies SessionService);

  const membershipReader: MembershipReader = overrides.membershipReader ?? {
    listMemberships: () => Promise.resolve([]),
    assertMembership: () =>
      Promise.reject(new AppError({ code: ErrorCode.NotImplemented, message: 'stub' }))
  };
  const logoutUseCase =
    overrides.logoutUseCase ??
    ({
      execute: async () => undefined
    } as IaaApiDeps['logoutUseCase']);
  const logoutAllUseCase =
    overrides.logoutAllUseCase ??
    ({
      execute: async () => undefined
    } as IaaApiDeps['logoutAllUseCase']);

  const stubNotImplemented = (): never => {
    throw new AppError({ code: ErrorCode.NotImplemented, message: 'Not implemented' });
  };

  const requestOtpUseCase: RequestOtpUseCase = overrides.requestOtpUseCase ?? {
    execute: () => Promise.reject(stubNotImplemented())
  };
  const verifyOtpUseCase: VerifyOtpUseCase = overrides.verifyOtpUseCase ?? {
    execute: () => Promise.reject(stubNotImplemented())
  };

  const server = await buildServerWithDeps({
    logger: overrides.logger ?? silentLogger,
    requestOtpUseCase,
    verifyOtpUseCase,
    logoutUseCase,
    logoutAllUseCase,
    sessionService,
    membershipReader
  });

  return { server, tokenSigner };
};

// ---------------------------------------------------------------------------
// Shared server builder
// ---------------------------------------------------------------------------

const buildServerWithDeps = async (deps: IaaApiDeps) => {
  const server = Fastify({ logger: false });

  server.setErrorHandler(async (error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError({ code: ErrorCode.InternalError, message: 'Internal server error' });
    const { status, body } = errorToHttp(appError, request.id);
    await reply.status(status).send(body);
  });

  await registerIaaApiRoutes(server, deps);
  return server;
};

// ---------------------------------------------------------------------------
// Legacy export — kept for backwards compatibility with older test files
// ---------------------------------------------------------------------------

/** @deprecated Use buildIaaStubTestServer or buildIaaApiTestServer instead. */
export const buildIaaTestServer = buildIaaStubTestServer;
