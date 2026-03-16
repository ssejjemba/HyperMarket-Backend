import { ErrorCode } from '@hypermarket/contracts';

import { MediaError } from '../errors/MediaError';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export type MediaUploadConstraints = {
  maxFileBytes: number;
  allowedMimeTypes: readonly AllowedImageMimeType[];
};

export class MediaUploadPolicy {
  constructor(private readonly constraints: MediaUploadConstraints) {}

  assertMimeAllowed(mimeType: string): AllowedImageMimeType {
    const allowedMimeType = ALLOWED_IMAGE_MIME_TYPES.find((allowed) => allowed === mimeType);
    if (allowedMimeType === undefined) {
      throw new MediaError({
        code: ErrorCode.MediaMimeNotAllowed,
        message: 'mime_type is not allowed',
        details: {
          mime_type: mimeType,
          allowed_mime_types: [...this.constraints.allowedMimeTypes]
        }
      });
    }

    return allowedMimeType;
  }

  assertByteSizeAllowed(byteSize: number): number {
    if (!Number.isInteger(byteSize) || byteSize <= 0) {
      throw new MediaError({
        code: ErrorCode.MediaValidationFailed,
        message: 'byte_size must be a positive integer'
      });
    }

    if (byteSize > this.constraints.maxFileBytes) {
      throw new MediaError({
        code: ErrorCode.MediaFileTooLarge,
        message: 'byte_size exceeds the configured file size limit',
        details: {
          byte_size: byteSize,
          max_file_bytes: this.constraints.maxFileBytes
        }
      });
    }

    return byteSize;
  }

  getConstraints(): MediaUploadConstraints {
    return this.constraints;
  }
}

export const createDefaultMediaUploadPolicy = (maxFileBytes: number): MediaUploadPolicy =>
  new MediaUploadPolicy({
    maxFileBytes,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES
  });
