import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { registerTemplateApiRoutes } from './api/routes';

export const registerTemplateRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  await registerTemplateApiRoutes(server, {
    logger: deps.logger
  });
};

export { registerTemplateApiRoutes } from './api/routes';
