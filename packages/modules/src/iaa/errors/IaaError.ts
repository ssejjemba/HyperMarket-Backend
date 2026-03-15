import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

/**
 * Subset of ErrorCode values that belong to the IAA module.
 * Using ErrorCode members directly keeps the central enum as the
 * single source of truth while enforcing module-level specificity.
 */
export type IaaErrorCode =
  | ErrorCode.AuthInvalidPhoneFormat
  | ErrorCode.AuthPhoneCountryNotSupported
  | ErrorCode.AuthOtpRateLimitedPhone
  | ErrorCode.AuthOtpRateLimitedIp
  | ErrorCode.AuthChallengeNotFound
  | ErrorCode.AuthChallengeExpired
  | ErrorCode.AuthChallengeLocked
  | ErrorCode.AuthChallengeConsumed
  | ErrorCode.AuthChallengePhoneMismatch
  | ErrorCode.AuthOtpInvalid
  | ErrorCode.AuthUserSuspended
  | ErrorCode.AuthSessionIssueFailed
  | ErrorCode.AuthMissingToken
  | ErrorCode.AuthInvalidToken
  | ErrorCode.AuthSessionNotFound
  | ErrorCode.AuthSessionExpired
  | ErrorCode.AuthSessionRevoked
  | ErrorCode.AuthTenantMembershipMissing
  | ErrorCode.AuthTenantMembershipRevoked
  | ErrorCode.AuthProviderUnavailable
  | ErrorCode.AuthDbFailure;

type IaaErrorParams = {
  code: IaaErrorCode;
  /** Safe, user-facing message — never include internal details here. */
  message: string;
  /** Safe, user-facing structured details exposed in the HTTP response. */
  details?: Record<string, unknown>;
  /** Internal-only cause; never serialised into the HTTP envelope. */
  cause?: unknown;
};

/**
 * Typed error for the IAA module.
 *
 * Extends AppError so it flows through the shared Fastify error handler
 * and errorToHttp without any special casing, while restricting `code`
 * to the IAA-specific subset at compile time.
 */
export class IaaError extends AppError {
  // `declare` narrows the inherited `code` type without emitting a
  // runtime assignment — the value is set by AppError's constructor.
  declare readonly code: IaaErrorCode;

  constructor(params: IaaErrorParams) {
    super(params);
    this.name = 'IaaError';
  }

  static is(error: unknown): error is IaaError {
    return error instanceof IaaError;
  }
}
