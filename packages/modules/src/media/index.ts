import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';

export const registerMediaRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {};

export {
  ALLOWED_IMAGE_MIME_TYPES,
  buildMediaPublicUrl,
  buildMediaStorageKey,
  createDefaultMediaUploadPolicy,
  MediaUploadPolicy,
  sanitizeOriginalFilename
} from './domain';
export type { AllowedImageMimeType, MediaUploadConstraints } from './domain';
export { createMediaUseCases } from './application/useCases';
export { MediaError } from './errors/MediaError';
export type { MediaErrorCode } from './errors/MediaError';
export { createNoopMediaMetrics, createInMemoryMediaMetrics } from './observability/mediaMetrics';
export type { InMemoryMediaMetrics, MediaMetrics } from './observability/mediaMetrics';
export { createMediaAssetRepoPg } from './persistence/MediaAssetRepoPg';
export type { MediaAssetRecord, MediaAssetStatus } from './persistence/MediaAssetRepoPg';
export { createSignedUploadUrlSigner } from './storage/UploadUrlSigner';
export type { UploadUrlDescriptor, UploadUrlSigner } from './storage/UploadUrlSigner';
