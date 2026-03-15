import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type PublishingErrorCode =
  | ErrorCode.ConfigInvalidPayload
  | ErrorCode.ConfigSchemaMismatch
  | ErrorCode.ConfigNotFound
  | ErrorCode.ConfigNotOwnedByTenant
  | ErrorCode.ConfigAlreadyActive
  | ErrorCode.ConfigNotDraft
  | ErrorCode.ConfigVersionConflict
  | ErrorCode.PublishValidationFailed
  | ErrorCode.PublishFailed
  | ErrorCode.RollbackFailed
  | ErrorCode.RevalidationDispatchFailed;

type PublishingErrorParams = {
  code: PublishingErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class PublishingError extends AppError {
  declare readonly code: PublishingErrorCode;

  constructor(params: PublishingErrorParams) {
    super(params);
    this.name = 'PublishingError';
  }

  static is(error: unknown): error is PublishingError {
    return error instanceof PublishingError;
  }
}
