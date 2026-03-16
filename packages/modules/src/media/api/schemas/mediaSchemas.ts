import { z } from 'zod';
import { ErrorCode } from '@hypermarket/contracts';

import { MediaError } from '../../errors/MediaError';

export const tenantIdParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID')
});

export const mediaAssetParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  assetId: z.string().uuid('assetId must be a valid UUID')
});

export const issueUploadTokenBodySchema = z
  .object({
    mime_type: z.string().min(1, 'mime_type is required'),
    byte_size: z.number().int(),
    original_filename: z.string().trim().max(255).optional()
  })
  .strict();

export const confirmMediaBodySchema = z
  .object({
    asset_id: z.string().uuid('asset_id must be a valid UUID'),
    storage_key: z.string().min(1, 'storage_key is required'),
    mime_type: z.string().min(1, 'mime_type is required'),
    byte_size: z.number().int(),
    checksum: z.string().trim().max(255).nullable().optional()
  })
  .strict();

export const listMediaQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const parseMediaValidation = <T>(result: z.SafeParseReturnType<unknown, T>): T => {
  if (!result.success) {
    throw new MediaError({
      code: ErrorCode.MediaValidationFailed,
      message: result.error.issues[0]?.message ?? 'Media request is invalid',
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  return result.data;
};
