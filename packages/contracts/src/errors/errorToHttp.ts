import type { AppError } from './AppError';
import { ErrorCode } from './errorCodes';

type ErrorResponse = {
  request_id: string;
  error_code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

type ErrorHttpResult = {
  status: number;
  body: ErrorResponse;
};

const codeToStatus: Record<ErrorCode, number> = {
  [ErrorCode.ValidationFailed]: 400,
  [ErrorCode.Unauthorized]: 401,
  [ErrorCode.Forbidden]: 403,
  [ErrorCode.NotFound]: 404,
  [ErrorCode.Conflict]: 409,
  [ErrorCode.RateLimited]: 429,
  [ErrorCode.IdempotencyConflict]: 409,
  [ErrorCode.TenantResolutionFailed]: 404,
  [ErrorCode.PublishValidationFailed]: 400,
  [ErrorCode.PaymentProviderError]: 502,
  [ErrorCode.NotificationFailed]: 502,
  [ErrorCode.InternalError]: 500,
  [ErrorCode.NotImplemented]: 501,
  [ErrorCode.DevFeatureDisabled]: 404,
  [ErrorCode.DevOtpNotFound]: 404,
  [ErrorCode.DevForbidden]: 403,

  // TEN codes
  [ErrorCode.TenantSlugInvalid]: 400,
  [ErrorCode.TenantSlugTaken]: 409,
  [ErrorCode.TenantNotFound]: 404,
  [ErrorCode.TenantSuspended]: 403,
  [ErrorCode.TenantArchived]: 409,
  [ErrorCode.TenantDomainInvalid]: 400,
  [ErrorCode.TenantDomainTaken]: 409,
  [ErrorCode.TenantDomainNotFound]: 404,
  [ErrorCode.TenantSettingsInvalid]: 400,
  [ErrorCode.TenantMembershipExists]: 409,
  [ErrorCode.TenantMembershipNotFound]: 404,
  [ErrorCode.TenantMembershipRevoked]: 403,
  [ErrorCode.TenantMembershipRoleInvalid]: 400,
  [ErrorCode.TenantAccessForbidden]: 403,
  [ErrorCode.TenantDbFailure]: 500,

  // IAA codes
  [ErrorCode.AuthInvalidPhoneFormat]: 400,
  [ErrorCode.AuthPhoneCountryNotSupported]: 400,
  [ErrorCode.AuthOtpRateLimitedPhone]: 429,
  [ErrorCode.AuthOtpRateLimitedIp]: 429,
  [ErrorCode.AuthChallengeNotFound]: 404,
  [ErrorCode.AuthChallengeExpired]: 422,
  [ErrorCode.AuthChallengeLocked]: 429,
  [ErrorCode.AuthChallengeConsumed]: 409,
  [ErrorCode.AuthChallengePhoneMismatch]: 422,
  [ErrorCode.AuthOtpInvalid]: 422,
  [ErrorCode.AuthUserSuspended]: 403,
  [ErrorCode.AuthSessionIssueFailed]: 500,
  [ErrorCode.AuthMissingToken]: 401,
  [ErrorCode.AuthInvalidToken]: 401,
  [ErrorCode.AuthSessionNotFound]: 401,
  [ErrorCode.AuthSessionExpired]: 401,
  [ErrorCode.AuthSessionRevoked]: 401,
  [ErrorCode.AuthTenantMembershipMissing]: 403,
  [ErrorCode.AuthTenantMembershipRevoked]: 403,
  [ErrorCode.AuthProviderAuthFailed]: 502,
  [ErrorCode.AuthProviderRateLimited]: 429,
  [ErrorCode.AuthProviderUnavailable]: 503,
  [ErrorCode.AuthDbFailure]: 500
};

export const errorToHttp = (error: AppError, requestId: string): ErrorHttpResult => {
  const status = codeToStatus[error.code] ?? 500;
  const body: ErrorResponse = {
    request_id: requestId,
    error_code: error.code,
    message: error.message
  };

  if (error.details !== undefined) {
    body.details = error.details;
  }

  return { status, body };
};
