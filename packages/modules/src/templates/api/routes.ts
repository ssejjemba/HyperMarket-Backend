import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { makeNotImplementedTemplateHandler } from './controllers/notImplementedTemplateController';

export type TemplateApiDeps = {
  logger: BaseLogger;
};

export const registerTemplateApiRoutes = async (
  server: FastifyInstance,
  deps: TemplateApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'templates' }, 'registering TMP routes');

  server.get(
    '/templates',
    makeNotImplementedTemplateHandler(deps.logger, 'templates.list_templates.not_implemented')
  );

  server.get(
    '/templates/:templateId/versions',
    makeNotImplementedTemplateHandler(
      deps.logger,
      'templates.list_template_versions.not_implemented'
    )
  );

  server.get(
    '/templates/:templateId/versions/:version/schema',
    makeNotImplementedTemplateHandler(deps.logger, 'templates.get_template_schema.not_implemented')
  );
};
