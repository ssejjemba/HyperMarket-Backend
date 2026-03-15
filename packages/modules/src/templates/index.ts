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
export { createTemplateRegistry } from './persistence';
export type { TemplateRegistry } from './persistence';
export { TemplateError } from './errors/TemplateError';
export type { TemplateErrorCode } from './errors/TemplateError';
