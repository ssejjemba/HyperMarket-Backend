import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../errors/IaaError';
import type { UserIdentity } from '../user/domain/UserIdentity';
import type { SessionRepository } from './persistence/SessionRepository';
import type { TokenSigner } from './TokenSigner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssueSessionResult = {
  /** Signed JWT bearer token. Never log this value. */
  accessToken: string;
  expiresAt: Date;
};

export type ValidateSessionResult = {
  userId: string;
  sessionId: string;
};

export type SessionServiceDeps = {
  signer: TokenSigner;
  repo: SessionRepository;
  ttlSeconds: number;
};

export type SessionService = {
  /**
   * Issue a JWT for the given verified user.
   * Wraps any unexpected signing error as AUTH_SESSION_ISSUE_FAILED.
   */
  issueSession(user: UserIdentity): Promise<IssueSessionResult>;

  /**
   * Validate a bearer token from an incoming request.
   * - undefined / empty → AUTH_MISSING_TOKEN
   * - expired          → AUTH_SESSION_EXPIRED
   * - tampered / bad   → AUTH_INVALID_TOKEN
   */
  validateSession(token: string | undefined | null): Promise<ValidateSessionResult>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createSessionService = (deps: SessionServiceDeps): SessionService => {
  const { signer, repo, ttlSeconds } = deps;

  return {
    async issueSession(user: UserIdentity): Promise<IssueSessionResult> {
      try {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        const session = await repo.createSession(user.id, '', expiresAt);
        const { token, expiresAt: signedExpiresAt } = await signer.sign(
          user.id,
          session.id,
          expiresAt
        );
        return { accessToken: token, expiresAt: signedExpiresAt };
      } catch (e) {
        // Re-throw typed IaaErrors as-is (e.g. if signer itself throws one).
        if (IaaError.is(e)) throw e;
        throw new IaaError({
          code: ErrorCode.AuthSessionIssueFailed,
          message: 'Failed to issue session token',
          cause: e
        });
      }
    },

    async validateSession(token: string | undefined | null): Promise<ValidateSessionResult> {
      if (token === undefined || token === null || token.trim() === '') {
        throw new IaaError({
          code: ErrorCode.AuthMissingToken,
          message: 'Authorization token is required'
        });
      }

      // signer.verify throws AUTH_SESSION_EXPIRED or AUTH_INVALID_TOKEN.
      const claims = await signer.verify(token);
      const session = await repo.getSessionById(claims.sessionId);
      if (session === null) {
        throw new IaaError({
          code: ErrorCode.AuthSessionNotFound,
          message: 'Session not found'
        });
      }

      if (session.revokedAt !== null) {
        throw new IaaError({
          code: ErrorCode.AuthSessionRevoked,
          message: 'Session has been revoked'
        });
      }

      return { userId: claims.userId, sessionId: claims.sessionId };
    }
  };
};
