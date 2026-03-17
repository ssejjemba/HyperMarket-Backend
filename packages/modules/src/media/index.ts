import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import { createMembershipReaderPg } from '../tenancy/persistence/TenancyMembershipReaderPg';
import { registerMediaApiRoutes } from './api/routes';
import { createMediaUseCases } from './application/useCases';
import { createNoopMediaMetrics } from './observability/mediaMetrics';
import { createPrometheusMediaMetrics } from './observability/promMetrics';
import { createSignedUploadUrlSigner } from './storage/UploadUrlSigner';

export const registerMediaRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  const sessionRepo = createSessionRepoPg(deps.db);
  const tokenSigner = createTokenSigner({
    secret: deps.config.jwtSecret,
    ttlSeconds: deps.config.sessionTtlSeconds,
    issuer: deps.config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: deps.config.sessionTtlSeconds
  });
  const membershipReader = createMembershipReaderPg(deps.db);
  const useCases = createMediaUseCases({
    db: deps.db,
    logger: deps.logger,
    metrics:
      'metricsRegistry' in deps && deps.metricsRegistry !== undefined
        ? createPrometheusMediaMetrics(deps.metricsRegistry)
        : createNoopMediaMetrics(),
    uploadUrlSigner: createSignedUploadUrlSigner({
      baseUrl: deps.config.mediaUploadBaseUrl,
      secret: deps.config.jwtSecret,
      ttlSeconds: deps.config.mediaUploadUrlTtlSeconds
    }),
    maxFileBytes: deps.config.mediaMaxFileBytes,
    cdnBaseUrl: deps.config.mediaCdnBaseUrl
  });

  await registerMediaApiRoutes(server, {
    logger: deps.logger,
    sessionService,
    membershipReader,
    useCases
  });
};

export {
  ALLOWED_IMAGE_MIME_TYPES,
  buildMediaPublicUrl,
  buildMediaStorageKey,
  createDefaultMediaUploadPolicy,
  MediaUploadPolicy,
  sanitizeOriginalFilename
} from './domain';
export type { AllowedImageMimeType, MediaUploadConstraints } from './domain';
export { registerMediaApiRoutes } from './api/routes';
export { createMediaUseCases } from './application/useCases';
export { MediaError } from './errors/MediaError';
export type { MediaErrorCode } from './errors/MediaError';
export { createNoopMediaMetrics, createInMemoryMediaMetrics } from './observability/mediaMetrics';
export type { InMemoryMediaMetrics, MediaMetrics } from './observability/mediaMetrics';
export { createPrometheusMediaMetrics } from './observability/promMetrics';
export { createMediaAssetRepoPg } from './persistence/MediaAssetRepoPg';
export type { MediaAssetRecord, MediaAssetStatus } from './persistence/MediaAssetRepoPg';
export { createSignedUploadUrlSigner } from './storage/UploadUrlSigner';
export type { UploadUrlDescriptor, UploadUrlSigner } from './storage/UploadUrlSigner';
