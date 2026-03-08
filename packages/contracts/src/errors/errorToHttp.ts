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
  [ErrorCode.InternalError]: 500
};

export const errorToHttp = (error: AppError, requestId: string): ErrorHttpResult => {
  const status = codeToStatus[error.code] ?? 500;

  return {
    status,
    body: {
      request_id: requestId,
      error_code: error.code,
      message: error.message,
      details: error.details
    }
  };
};
