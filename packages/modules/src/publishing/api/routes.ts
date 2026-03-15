import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { requireTenantMembership } from '@hypermarket/core/http';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type { MembershipReader } from '../../tenancy/MembershipReader';
import { makeNotImplementedPublishingHandler } from './controllers/notImplementedPublishingController';

export type PublishingApiDeps = {
  logger: BaseLogger;
  sessionService: SessionService;
  membershipReader: MembershipReader;
};

export const registerPublishingApiRoutes = async (
  server: FastifyInstance,
  deps: PublishingApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'publishing' }, 'registering PUB routes');

  const tenantGuard = requireTenantMembership({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });

  server.post(
    '/tenants/:tenantId/configs',
    { preHandler: tenantGuard },
    makeNotImplementedPublishingHandler(deps.logger, 'publishing.create_config.not_implemented')
  );

  server.get(
    '/tenants/:tenantId/configs',
    { preHandler: tenantGuard },
    makeNotImplementedPublishingHandler(deps.logger, 'publishing.list_configs.not_implemented')
  );

  server.get(
    '/tenants/:tenantId/configs/:configId',
    { preHandler: tenantGuard },
    makeNotImplementedPublishingHandler(deps.logger, 'publishing.get_config.not_implemented')
  );

  server.patch(
    '/tenants/:tenantId/configs/:configId',
    { preHandler: tenantGuard },
    makeNotImplementedPublishingHandler(deps.logger, 'publishing.update_config.not_implemented')
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
