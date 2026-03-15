import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { requireTenantMembership } from '@hypermarket/core/http';

import type { SessionService } from '../../iaa/session/SessionService';
import type { CreateTenantUseCase } from '../application';
import type { MembershipReader } from '../MembershipReader';
import { makeCreateTenantHandler } from './controllers/createTenantController';
import { makeNotImplementedTenantHandler } from './controllers/notImplementedTenantController';

export type TenancyApiDeps = {
  logger: BaseLogger;
  createTenantUseCase: CreateTenantUseCase;
  sessionService: SessionService;
  membershipReader: MembershipReader;
};

export const registerTenancyApiRoutes = async (
  server: FastifyInstance,
  deps: TenancyApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'tenancy' }, 'registering TEN routes');
  const tenantGuard = requireTenantMembership({
    getAuth: async (request) =>
      deps.sessionService.validateSession(
        request.headers.authorization?.startsWith('Bearer ') === true
          ? request.headers.authorization.slice(7)
          : undefined
      ),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });

  server.post('/tenants', makeCreateTenantHandler(deps.createTenantUseCase, deps.sessionService));

  server.get(
    '/tenants',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.list_tenants.not_implemented')
  );

  server.get(
    '/tenants/:tenantId',
    { preHandler: tenantGuard },
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.get_tenant.not_implemented')
  );

  server.get(
    '/tenants/:tenantId/settings',
    { preHandler: tenantGuard },
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.get_tenant_settings.not_implemented')
  );

  server.patch(
    '/tenants/:tenantId/settings',
    { preHandler: tenantGuard },
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.update_tenant_settings.not_implemented')
  );

  server.get(
    '/tenants/:tenantId/memberships',
    { preHandler: tenantGuard },
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.list_tenant_memberships.not_implemented')
  );

  server.post(
    '/tenants/:tenantId/memberships/revoke',
    { preHandler: tenantGuard },
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.revoke_tenant_membership.not_implemented')
  );
};
