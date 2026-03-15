import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { requireTenantMembership } from '@hypermarket/core/http';

import type { SessionService } from '../../iaa/session/SessionService';
import type {
  CreateTenantUseCase,
  GetTenantUseCase,
  GetTenantSettingsUseCase,
  ListTenantsUseCase,
  UpdateTenantSettingsUseCase
} from '../application';
import type { MembershipReader } from '../MembershipReader';
import { makeCreateTenantHandler } from './controllers/createTenantController';
import { makeGetTenantHandler } from './controllers/getTenantController';
import { makeGetTenantSettingsHandler } from './controllers/getTenantSettingsController';
import { makeListTenantsHandler } from './controllers/listTenantsController';
import { makeNotImplementedTenantHandler } from './controllers/notImplementedTenantController';
import { makeUpdateTenantSettingsHandler } from './controllers/updateTenantSettingsController';

export type TenancyApiDeps = {
  logger: BaseLogger;
  createTenantUseCase: CreateTenantUseCase;
  getTenantUseCase: GetTenantUseCase;
  getTenantSettingsUseCase: GetTenantSettingsUseCase;
  listTenantsUseCase: ListTenantsUseCase;
  updateTenantSettingsUseCase: UpdateTenantSettingsUseCase;
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

  server.get('/tenants', makeListTenantsHandler(deps.listTenantsUseCase, deps.sessionService));

  server.get(
    '/tenants/:tenantId',
    { preHandler: tenantGuard },
    makeGetTenantHandler(deps.getTenantUseCase)
  );

  server.get(
    '/tenants/:tenantId/settings',
    { preHandler: tenantGuard },
    makeGetTenantSettingsHandler(deps.getTenantSettingsUseCase)
  );

  server.patch(
    '/tenants/:tenantId/settings',
    { preHandler: tenantGuard },
    makeUpdateTenantSettingsHandler(deps.updateTenantSettingsUseCase)
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
