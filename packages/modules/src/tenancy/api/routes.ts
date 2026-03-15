import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { makeNotImplementedTenantHandler } from './controllers/notImplementedTenantController';

export type TenancyApiDeps = {
  logger: BaseLogger;
};

export const registerTenancyApiRoutes = async (
  server: FastifyInstance,
  deps: TenancyApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'tenancy' }, 'registering TEN routes');

  server.post(
    '/tenants',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.create_tenant.not_implemented')
  );

  server.get(
    '/tenants',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.list_tenants.not_implemented')
  );

  server.get(
    '/tenants/:tenantId',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.get_tenant.not_implemented')
  );

  server.get(
    '/tenants/:tenantId/settings',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.get_tenant_settings.not_implemented')
  );

  server.patch(
    '/tenants/:tenantId/settings',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.update_tenant_settings.not_implemented')
  );

  server.get(
    '/tenants/:tenantId/memberships',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.list_tenant_memberships.not_implemented')
  );

  server.post(
    '/tenants/:tenantId/memberships/revoke',
    makeNotImplementedTenantHandler(deps.logger, 'tenancy.revoke_tenant_membership.not_implemented')
  );
};
