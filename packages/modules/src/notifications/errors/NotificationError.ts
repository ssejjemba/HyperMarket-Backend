import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type NotificationErrorCode =
  | ErrorCode.NotTemplateNotFound
  | ErrorCode.NotTemplatePayloadInvalid
  | ErrorCode.NotRecipientInvalid
  | ErrorCode.NotProviderUnavailable
  | ErrorCode.NotProviderAuthFailed
  | ErrorCode.NotProviderRateLimited
  | ErrorCode.NotSendFailedRetryable
  | ErrorCode.NotSendFailedNonRetryable
  | ErrorCode.NotJobNotFound
  | ErrorCode.NotJobDedupeConflict
  | ErrorCode.NotDbFailure;

type NotificationErrorParams = {
  code: NotificationErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class NotificationError extends AppError {
  declare readonly code: NotificationErrorCode;

  constructor(params: NotificationErrorParams) {
    super(params);
    this.name = 'NotificationError';
  }

  static is(error: unknown): error is NotificationError {
    return error instanceof NotificationError;
  }
}
