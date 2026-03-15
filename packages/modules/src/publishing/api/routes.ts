import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import type { DatabaseSchema } from '@hypermarket/core';
import { requireTenantMembership } from '@hypermarket/core/http';
import type { Kysely } from 'kysely';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type { MembershipReader } from '../../tenancy/MembershipReader';
import { createTemplateRegistry } from '../../templates';
import {
  createCreateDraftConfigUseCase,
  createGetStoreConfigUseCase,
  createListStoreConfigsUseCase,
  createUpdateStoreConfigUseCase,
  type ConfigValidator
} from '../application';
import { makeCreateStoreConfigHandler } from './controllers/createStoreConfigController';
import { makeGetStoreConfigHandler } from './controllers/getStoreConfigController';
import { makeListStoreConfigsHandler } from './controllers/listStoreConfigsController';
import { makeNotImplementedPublishingHandler } from './controllers/notImplementedPublishingController';
import { makeUpdateStoreConfigHandler } from './controllers/updateStoreConfigController';

export type PublishingApiDeps = {
  db: Kysely<DatabaseSchema>;
  logger: BaseLogger;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  configValidator: ConfigValidator;
};

export const registerPublishingApiRoutes = async (
  server: FastifyInstance,
  deps: PublishingApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'publishing' }, 'registering PUB routes');
  const templateRegistry = createTemplateRegistry();
  const createDraftConfigUseCase = createCreateDraftConfigUseCase({
    db: deps.db,
    templateRegistry,
    configValidator: deps.configValidator
  });
  const listStoreConfigsUseCase = createListStoreConfigsUseCase(deps.db);
  const getStoreConfigUseCase = createGetStoreConfigUseCase(deps.db);
  const updateStoreConfigUseCase = createUpdateStoreConfigUseCase({
    db: deps.db,
    configValidator: deps.configValidator
  });

  const tenantGuard = requireTenantMembership({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });

  server.post(
    '/tenants/:tenantId/configs',
    { preHandler: tenantGuard },
    makeCreateStoreConfigHandler(createDraftConfigUseCase)
  );

  server.get(
    '/tenants/:tenantId/configs',
    { preHandler: tenantGuard },
    makeListStoreConfigsHandler(listStoreConfigsUseCase)
  );

  server.get(
    '/tenants/:tenantId/configs/:configId',
    { preHandler: tenantGuard },
    makeGetStoreConfigHandler(getStoreConfigUseCase)
  );

  server.patch(
    '/tenants/:tenantId/configs/:configId',
    { preHandler: tenantGuard },
    makeUpdateStoreConfigHandler(updateStoreConfigUseCase)
  );

  server.post(
    '/tenants/:tenantId/publish',
    { preHandler: tenantGuard },
    makeNotImplementedPublishingHandler(deps.logger, 'publishing.publish.not_implemented')
  );

  server.post(
    '/tenants/:tenantId/rollback',
    { preHandler: tenantGuard },
    makeNotImplementedPublishingHandler(deps.logger, 'publishing.rollback.not_implemented')
  );
};
