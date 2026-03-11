import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../../src/types';
import { registerIaaApiRoutes } from './api/routes';

export const registerIaaRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  await registerIaaApiRoutes(server, deps);
};

export type { ModuleDeps };
export { IaaError } from './errors/IaaError';
export type { IaaErrorCode } from './errors/IaaError';
