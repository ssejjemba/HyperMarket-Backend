import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BaseLogger } from 'pino';

import { requireTenantMembership, requireTenantOwner } from '@hypermarket/core/http';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type { MembershipReader } from '../../tenancy/MembershipReader';
import type { createMediaUseCases } from '../application/useCases';
import { mapMediaAssetDto } from './controllers/mappers';
import {
  confirmMediaBodySchema,
  issueUploadTokenBodySchema,
  listMediaQuerySchema,
  mediaAssetParamsSchema,
  parseMediaValidation,
  tenantIdParamsSchema
} from './schemas/mediaSchemas';

export type MediaApiDeps = {
  logger: BaseLogger;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  useCases: ReturnType<typeof createMediaUseCases>;
};

const getTenantId = (request: FastifyRequest): string => {
  const tenantId = request.tenant?.tenantId;
  if (tenantId === undefined) {
    throw new Error('tenant context is required');
  }

  return tenantId;
};

const getActorUserId = (request: FastifyRequest): string => {
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new Error('auth context is required');
  }

  return userId;
};

export const registerMediaApiRoutes = async (
  server: FastifyInstance,
  deps: MediaApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'media' }, 'registering MED routes');

  const tenantGuard = requireTenantMembership({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });
  const tenantOwnerGuard = requireTenantOwner({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });

  server.post(
    '/tenants/:tenantId/media/upload-token',
    { preHandler: tenantGuard },
    async (request) => {
      parseMediaValidation(tenantIdParamsSchema.safeParse(request.params));
      const body = parseMediaValidation(issueUploadTokenBodySchema.safeParse(request.body));
      const uploadToken = await deps.useCases.issueUploadToken({
        tenantId: getTenantId(request),
        actorUserId: getActorUserId(request),
        requestId: request.id,
        mimeType: body.mime_type,
        byteSize: body.byte_size,
        ...(body.original_filename !== undefined
          ? { originalFilename: body.original_filename }
          : {})
      });

      return {
        asset_id: uploadToken.assetId,
        storage_key: uploadToken.storageKey,
        upload_url: uploadToken.uploadUrl,
        upload_headers: uploadToken.uploadHeaders,
        expires_at: uploadToken.expiresAt.toISOString(),
        constraints: {
          max_file_bytes: uploadToken.constraints.maxFileBytes,
          allowed_mime_types: [...uploadToken.constraints.allowedMimeTypes]
        }
      };
    }
  );

  server.post('/tenants/:tenantId/media/confirm', { preHandler: tenantGuard }, async (request) => {
    parseMediaValidation(tenantIdParamsSchema.safeParse(request.params));
    const body = parseMediaValidation(confirmMediaBodySchema.safeParse(request.body));
    const asset = await deps.useCases.confirmUpload({
      tenantId: getTenantId(request),
      actorUserId: getActorUserId(request),
      requestId: request.id,
      assetId: body.asset_id,
      storageKey: body.storage_key,
      mimeType: body.mime_type,
      byteSize: body.byte_size,
      ...(body.checksum !== undefined ? { checksum: body.checksum } : {})
    });

    return { asset: mapMediaAssetDto(asset) };
  });

  server.get('/tenants/:tenantId/media', { preHandler: tenantGuard }, async (request) => {
    parseMediaValidation(tenantIdParamsSchema.safeParse(request.params));
    const query = parseMediaValidation(listMediaQuerySchema.safeParse(request.query));
    const result = await deps.useCases.listAssets({
      tenantId: getTenantId(request),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {})
    });

    return {
      assets: result.items.map(mapMediaAssetDto),
      next_cursor: result.nextCursor ?? null
    };
  });

  server.delete(
    '/tenants/:tenantId/media/:assetId',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseMediaValidation(mediaAssetParamsSchema.safeParse(request.params));
      const asset = await deps.useCases.deleteAsset({
        tenantId: getTenantId(request),
        actorUserId: getActorUserId(request),
        requestId: request.id,
        assetId: params.assetId
      });

      return { asset: mapMediaAssetDto(asset) };
    }
  );
};
