import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type MediaErrorCode =
  | ErrorCode.MediaMimeNotAllowed
  | ErrorCode.MediaFileTooLarge
  | ErrorCode.MediaQuotaExceeded
  | ErrorCode.MediaUploadTokenFailed
  | ErrorCode.MediaAssetNotFound
  | ErrorCode.MediaStorageKeyMismatch
  | ErrorCode.MediaConfirmFailed
  | ErrorCode.MediaDeleteForbidden
  | ErrorCode.MediaDeleteFailed
  | ErrorCode.MediaValidationFailed;

type MediaErrorParams = {
  code: MediaErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class MediaError extends AppError {
  declare readonly code: MediaErrorCode;

  constructor(params: MediaErrorParams) {
    super(params);
    this.name = 'MediaError';
  }

  static is(error: unknown): error is MediaError {
    return error instanceof MediaError;
  }
}
