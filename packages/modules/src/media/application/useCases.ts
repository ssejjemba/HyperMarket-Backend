import crypto from 'node:crypto';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';
import type { Kysely } from 'kysely';
import type { BaseLogger } from 'pino';
import { ErrorCode } from '@hypermarket/contracts';

import {
  buildMediaPublicUrl,
  buildMediaStorageKey,
  createDefaultMediaUploadPolicy,
  type AllowedImageMimeType
} from '../domain';
import { MediaError } from '../errors/MediaError';
import type { MediaMetrics } from '../observability/mediaMetrics';
import { createMediaAssetRepoPg, type MediaAssetRecord } from '../persistence/MediaAssetRepoPg';
import type { UploadUrlSigner } from '../storage/UploadUrlSigner';
import { toAuditRequestId } from './auditRequestId';

type UploadTokenOutput = {
  assetId: string;
  storageKey: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: Date;
  constraints: {
    maxFileBytes: number;
    allowedMimeTypes: readonly AllowedImageMimeType[];
  };
};

type MediaAssetDto = MediaAssetRecord & {
  publicUrl: string;
};

const toMediaAssetDto = (asset: MediaAssetRecord, cdnBaseUrl: string): MediaAssetDto => ({
  ...asset,
  publicUrl: buildMediaPublicUrl(cdnBaseUrl, asset.storageKey)
});

const toLogErrorCode = (error: unknown): string | undefined => {
  if (error instanceof MediaError) {
    return error.code;
  }

  return undefined;
};

export const createMediaUseCases = (deps: {
  db: Kysely<DatabaseSchema>;
  logger: BaseLogger;
  metrics: MediaMetrics;
  uploadUrlSigner: UploadUrlSigner;
  maxFileBytes: number;
  cdnBaseUrl: string;
}) => {
  const auditWriter = createAuditWriter();
  const uploadPolicy = createDefaultMediaUploadPolicy(deps.maxFileBytes);

  return {
    async issueUploadToken(input: {
      tenantId: string;
      actorUserId: string;
      requestId?: string;
      mimeType: string;
      byteSize: number;
      originalFilename?: string | undefined;
    }): Promise<UploadTokenOutput> {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createMediaAssetRepoPg(trx);
          const mimeType = uploadPolicy.assertMimeAllowed(input.mimeType);
          const byteSize = uploadPolicy.assertByteSizeAllowed(input.byteSize);
          const pendingAssetId = crypto.randomUUID();
          const storageKey = buildMediaStorageKey({
            tenantId: input.tenantId,
            assetId: pendingAssetId,
            originalFilename: input.originalFilename
          });
          const asset = await repo.createPendingAsset({
            tenantId: input.tenantId,
            assetId: pendingAssetId,
            storageKey,
            mimeType,
            byteSize,
            createdByUserId: input.actorUserId
          });
          const uploadDescriptor = deps.uploadUrlSigner.sign({
            assetId: asset.id,
            storageKey: asset.storageKey,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize
          });

          deps.logger.info(
            {
              event: 'media.upload_token_issued',
              tenant_id: input.tenantId,
              user_id: input.actorUserId,
              asset_id: asset.id,
              mime_type: asset.mimeType,
              byte_size: asset.byteSize,
              request_id: input.requestId
            },
            'Issued media upload token'
          );
          deps.metrics.uploadTokenIssuedTotal({ outcome: 'success' });

          return {
            assetId: asset.id,
            storageKey: asset.storageKey,
            uploadUrl: uploadDescriptor.uploadUrl,
            uploadHeaders: uploadDescriptor.uploadHeaders,
            expiresAt: uploadDescriptor.expiresAt,
            constraints: {
              maxFileBytes: uploadPolicy.getConstraints().maxFileBytes,
              allowedMimeTypes: uploadPolicy.getConstraints().allowedMimeTypes
            }
          };
        });
      } catch (error) {
        deps.logger.info(
          {
            event: 'media.upload_token_rejected',
            tenant_id: input.tenantId,
            user_id: input.actorUserId,
            mime_type: input.mimeType,
            byte_size: input.byteSize,
            request_id: input.requestId,
            error_code: toLogErrorCode(error)
          },
          'Rejected media upload token'
        );
        deps.metrics.uploadTokenIssuedTotal({
          outcome: 'failure',
          error_code: error instanceof MediaError ? error.code : undefined
        });
        throw error;
      }
    },

    async confirmUpload(input: {
      tenantId: string;
      actorUserId: string;
      requestId?: string;
      assetId: string;
      storageKey: string;
      mimeType: string;
      byteSize: number;
      checksum?: string | null | undefined;
    }): Promise<MediaAssetDto> {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createMediaAssetRepoPg(trx);
          const existing = await repo.getAssetById(input.tenantId, input.assetId);
          if (existing === null) {
            throw new MediaError({
              code: ErrorCode.MediaAssetNotFound,
              message: 'Media asset not found'
            });
          }

          if (existing.storageKey !== input.storageKey) {
            throw new MediaError({
              code: ErrorCode.MediaStorageKeyMismatch,
              message: 'storage_key does not match the pending asset record'
            });
          }

          if (existing.status === 'confirmed') {
            deps.metrics.assetConfirmTotal({ outcome: 'success' });
            return toMediaAssetDto(existing, deps.cdnBaseUrl);
          }

          const mimeType = uploadPolicy.assertMimeAllowed(input.mimeType);
          const byteSize = uploadPolicy.assertByteSizeAllowed(input.byteSize);
          const confirmed = await repo.confirmAsset({
            tenantId: input.tenantId,
            assetId: input.assetId,
            storageKey: input.storageKey,
            mimeType,
            byteSize,
            checksum: input.checksum
          });

          if (confirmed === null) {
            throw new MediaError({
              code: ErrorCode.MediaConfirmFailed,
              message: 'Media asset could not be confirmed'
            });
          }

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'media.asset.created',
            targetType: 'media_asset',
            targetId: confirmed.id,
            after: {
              id: confirmed.id,
              storage_key: confirmed.storageKey,
              mime_type: confirmed.mimeType,
              byte_size: confirmed.byteSize,
              status: confirmed.status
            },
            requestId: toAuditRequestId(input.requestId)
          });

          deps.logger.info(
            {
              event: 'media.asset_confirmed',
              tenant_id: input.tenantId,
              user_id: input.actorUserId,
              asset_id: confirmed.id,
              mime_type: confirmed.mimeType,
              byte_size: confirmed.byteSize,
              request_id: input.requestId
            },
            'Confirmed media asset'
          );
          deps.metrics.assetConfirmTotal({ outcome: 'success' });

          return toMediaAssetDto(confirmed, deps.cdnBaseUrl);
        });
      } catch (error) {
        deps.metrics.assetConfirmTotal({
          outcome: 'failure',
          error_code: error instanceof MediaError ? error.code : undefined
        });
        throw error;
      }
    },

    async listAssets(input: {
      tenantId: string;
      cursor?: string | undefined;
      limit?: number | undefined;
    }): Promise<{ items: MediaAssetDto[]; nextCursor?: string | undefined }> {
      const result = await createMediaAssetRepoPg(deps.db).listAssets({
        tenantId: input.tenantId,
        cursor: input.cursor,
        limit: input.limit ?? 20
      });

      return {
        items: result.items.map((asset) => toMediaAssetDto(asset, deps.cdnBaseUrl)),
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {})
      };
    },

    async deleteAsset(input: {
      tenantId: string;
      actorUserId: string;
      requestId?: string;
      assetId: string;
    }): Promise<MediaAssetDto> {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createMediaAssetRepoPg(trx);
          const asset = await repo.softDeleteAsset(input.tenantId, input.assetId);
          if (asset === null) {
            throw new MediaError({
              code: ErrorCode.MediaAssetNotFound,
              message: 'Media asset not found'
            });
          }

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'media.asset.deleted',
            targetType: 'media_asset',
            targetId: asset.id,
            after: {
              id: asset.id,
              storage_key: asset.storageKey,
              status: asset.status,
              deleted_at: asset.deletedAt?.toISOString() ?? null
            },
            requestId: toAuditRequestId(input.requestId)
          });

          deps.logger.info(
            {
              event: 'media.asset_deleted',
              tenant_id: input.tenantId,
              user_id: input.actorUserId,
              asset_id: asset.id,
              mime_type: asset.mimeType,
              byte_size: asset.byteSize,
              request_id: input.requestId
            },
            'Deleted media asset'
          );
          deps.metrics.assetDeleteTotal({ outcome: 'success' });

          return toMediaAssetDto(asset, deps.cdnBaseUrl);
        });
      } catch (error) {
        deps.metrics.assetDeleteTotal({
          outcome: 'failure',
          error_code: error instanceof MediaError ? error.code : undefined
        });
        throw error;
      }
    }
  };
};
