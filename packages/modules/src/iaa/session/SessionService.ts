import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../errors/IaaError';
import type { UserIdentity } from '../user/domain/UserIdentity';
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
};

export type SessionServiceDeps = {
  signer: TokenSigner;
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
  const { signer } = deps;

  return {
    async issueSession(user: UserIdentity): Promise<IssueSessionResult> {
      try {
        const { token, expiresAt } = await signer.sign(user.id);
        return { accessToken: token, expiresAt };
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
      return { userId: claims.userId };
    }
  };
};
