import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { registerIaaApiRoutes } from './api/routes';
import { createTenancyMembershipAdapter } from './membership/TenancyMembershipAdapter';
import { OtpChallengePolicy } from './otp/domain/OtpChallengePolicy';
import { createOtpSenderDevAdapter } from './otp/integrations/OtpSenderDevAdapter';
import { createOtpChallengeRepoPg } from './otp/persistence/OtpChallengeRepoPg';
import { createOtpChallengeService } from './otp/OtpChallengeService';
import { createRequestOtpUseCase } from './otp/application/RequestOtpUseCase';
import { createVerifyOtpUseCase } from './otp/application/VerifyOtpUseCase';
import { createSessionService } from './session/SessionService';
import { createSessionRepoPg } from './session/persistence/SessionRepoPg';
import { createTokenSigner } from './session/TokenSigner';
import { createUserRepoPg } from './user/persistence/UserRepoPg';
import { createUserService } from './user/UserService';

export const registerIaaRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  const policy = new OtpChallengePolicy({
    challengeTtlSeconds: deps.config.otpTtlSeconds,
    resendCooldownSeconds: 60,
    maxAttempts: 5,
    rateLimitWindowSeconds: 3600,
    rateLimitMaxChallengesPerPhone: 5
  });

  const otpRepo = createOtpChallengeRepoPg(deps.db);
  const userRepo = createUserRepoPg(deps.db);
  const sessionRepo = createSessionRepoPg(deps.db);
  const membershipReader = createTenancyMembershipAdapter(deps.db);

  const otpSender = createOtpSenderDevAdapter({ mode: 'dev', logger: deps.logger });

  const otpService = createOtpChallengeService({
    repo: otpRepo,
    sender: otpSender,
    policy,
    otpSecret: deps.config.otpSecret,
    logger: deps.logger
  });

  const userService = createUserService({ repo: userRepo });

  const tokenSigner = createTokenSigner({
    secret: deps.config.jwtSecret,
    ttlSeconds: deps.config.sessionTtlSeconds,
    issuer: deps.config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: deps.config.sessionTtlSeconds
  });

  const requestOtpUseCase = createRequestOtpUseCase({
    otpService,
    logger: deps.logger
  });
  const verifyOtpUseCase = createVerifyOtpUseCase({
    otpService,
    userService,
    sessionService,
    membershipReader,
    logger: deps.logger
  });

  await registerIaaApiRoutes(server, {
    logger: deps.logger,
    requestOtpUseCase,
    verifyOtpUseCase,
    sessionService,
    membershipReader
  });
};

export type { ModuleDeps };
export { IaaError } from './errors/IaaError';
export type { IaaErrorCode } from './errors/IaaError';
export { PhoneNumber } from './phone/PhoneNumber';
export { UgandaPhonePolicy } from './phone/UgandaPhonePolicy';
export { OtpChallenge } from './otp/domain/OtpChallenge';
export type { OtpChallengeProps, OtpChallengeStatus } from './otp/domain/OtpChallenge';
export { OtpChallengePolicy } from './otp/domain/OtpChallengePolicy';
export { createTwilioVerifyClient } from './otp/integrations/TwilioVerifyClient';
export type {
  TwilioHttpClient,
  TwilioVerifyChannel,
  TwilioVerifyClient,
  TwilioVerifyClientConfig,
  StartVerificationInput,
  StartVerificationResult,
  CheckVerificationInput,
  CheckVerificationResult
} from './otp/integrations/TwilioVerifyClient';
export { UserIdentity } from './user/domain/UserIdentity';
export type { UserStatus } from './user/domain/UserIdentity';
export type { UserRepository } from './user/persistence/UserRepository';
export { createUserRepoPg } from './user/persistence/UserRepoPg';
export { createUserService } from './user/UserService';
export type { UserService } from './user/UserService';
export { createRequestOtpUseCase } from './otp/application/RequestOtpUseCase';
export type {
  RequestOtpUseCase,
  RequestOtpInput,
  RequestOtpOutput
} from './otp/application/RequestOtpUseCase';
export { createVerifyOtpUseCase } from './otp/application/VerifyOtpUseCase';
export type {
  VerifyOtpUseCase,
  VerifyOtpInput,
  VerifyOtpOutput
} from './otp/application/VerifyOtpUseCase';
export { MembershipClaim } from './membership/MembershipClaim';
export type { MembershipStatus } from './membership/MembershipClaim';
export type { MembershipReader } from './membership/MembershipReader';
export { createTenancyMembershipAdapter } from './membership/TenancyMembershipAdapter';
export { createTokenSigner } from './session/TokenSigner';
export type { TokenSigner, TokenClaims } from './session/TokenSigner';
export { createSessionService } from './session/SessionService';
export { createSessionRepoPg } from './session/persistence/SessionRepoPg';
export type {
  SessionService,
  IssueSessionResult,
  ValidateSessionResult
} from './session/SessionService';
export type { SessionRecord, SessionRepository } from './session/persistence/SessionRepository';
export type { IaaLogEvent } from './observability/IaaLogEvent';
export { logIaaEvent } from './observability/IaaLogEvent';
export type { IaaMetrics, InMemoryIaaMetrics } from './observability/iaaMetrics';
export { createNoopIaaMetrics, createInMemoryIaaMetrics } from './observability/iaaMetrics';
