import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { registerIaaApiRoutes } from './api/routes';

export const registerIaaRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  await registerIaaApiRoutes(server, deps);
};

export type { ModuleDeps };
export { IaaError } from './errors/IaaError';
export type { IaaErrorCode } from './errors/IaaError';
export { PhoneNumber } from './phone/PhoneNumber';
export { OtpChallenge } from './otp/domain/OtpChallenge';
export type { OtpChallengeProps, OtpChallengeStatus } from './otp/domain/OtpChallenge';
export { OtpChallengePolicy } from './otp/domain/OtpChallengePolicy';
export { UserIdentity } from './user/domain/UserIdentity';
export type { UserStatus } from './user/domain/UserIdentity';
export type { UserRepository } from './user/persistence/UserRepository';
export { createUserRepoPg } from './user/persistence/UserRepoPg';
export { createUserService } from './user/UserService';
export type { UserService } from './user/UserService';
export { createTokenSigner } from './session/TokenSigner';
export type { TokenSigner, TokenClaims } from './session/TokenSigner';
export { createSessionService } from './session/SessionService';
export type {
  SessionService,
  IssueSessionResult,
  ValidateSessionResult
} from './session/SessionService';
