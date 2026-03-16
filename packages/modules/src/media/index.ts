import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';

export const registerMediaRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {};

export { MediaError } from './errors/MediaError';
export type { MediaErrorCode } from './errors/MediaError';
