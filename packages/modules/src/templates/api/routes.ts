import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import {
  createGetTemplateSchemaUseCase,
  createListTemplateVersionsUseCase,
  createListTemplatesUseCase
} from '../application';
import { createTemplateRegistry } from '../persistence';
import { makeGetTemplateSchemaHandler } from './controllers/getTemplateSchemaController';
import { makeListTemplateVersionsHandler } from './controllers/listTemplateVersionsController';
import { makeListTemplatesHandler } from './controllers/listTemplatesController';

export type TemplateApiDeps = {
  logger: BaseLogger;
};

export const registerTemplateApiRoutes = async (
  server: FastifyInstance,
  deps: TemplateApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'templates' }, 'registering TMP routes');
  const templateRegistry = createTemplateRegistry();
  const listTemplatesUseCase = createListTemplatesUseCase(templateRegistry);
  const listTemplateVersionsUseCase = createListTemplateVersionsUseCase(templateRegistry);
  const getTemplateSchemaUseCase = createGetTemplateSchemaUseCase(templateRegistry);

  server.get('/templates', makeListTemplatesHandler(listTemplatesUseCase));

  server.get(
    '/templates/:templateId/versions',
    makeListTemplateVersionsHandler(listTemplateVersionsUseCase)
  );

  server.get(
    '/templates/:templateId/versions/:version/schema',
    makeGetTemplateSchemaHandler(getTemplateSchemaUseCase)
  );
};
