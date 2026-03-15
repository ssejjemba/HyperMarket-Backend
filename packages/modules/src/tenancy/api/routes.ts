import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { requireTenantMembership, requireTenantOwner } from '@hypermarket/core/http';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type {
  CreateTenantMembershipUseCase,
  CreateTenantUseCase,
  GetTenantUseCase,
  GetTenantSettingsUseCase,
  ListTenantMembershipsUseCase,
  RevokeTenantMembershipUseCase,
  ListTenantsUseCase,
  UpdateTenantMembershipRoleUseCase,
  UpdateTenantSettingsUseCase
} from '../application';
import type { MembershipReader } from '../MembershipReader';
import { makeCreateTenantMembershipHandler } from './controllers/createTenantMembershipController';
import { makeCreateTenantHandler } from './controllers/createTenantController';
import { makeGetTenantHandler } from './controllers/getTenantController';
import { makeGetTenantSettingsHandler } from './controllers/getTenantSettingsController';
import { makeListTenantMembershipsHandler } from './controllers/listTenantMembershipsController';
import { makeListTenantsHandler } from './controllers/listTenantsController';
import { makeRevokeTenantMembershipHandler } from './controllers/revokeTenantMembershipController';
import { makeUpdateTenantMembershipRoleHandler } from './controllers/updateTenantMembershipRoleController';
import { makeUpdateTenantSettingsHandler } from './controllers/updateTenantSettingsController';

export type TenancyApiDeps = {
  logger: BaseLogger;
  createTenantMembershipUseCase: CreateTenantMembershipUseCase;
  createTenantUseCase: CreateTenantUseCase;
  getTenantUseCase: GetTenantUseCase;
  getTenantSettingsUseCase: GetTenantSettingsUseCase;
  listTenantMembershipsUseCase: ListTenantMembershipsUseCase;
  listTenantsUseCase: ListTenantsUseCase;
  revokeTenantMembershipUseCase: RevokeTenantMembershipUseCase;
  updateTenantMembershipRoleUseCase: UpdateTenantMembershipRoleUseCase;
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
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });
  const tenantOwnerGuard = requireTenantOwner({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
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
    makeListTenantMembershipsHandler(deps.listTenantMembershipsUseCase)
  );

  server.post(
    '/tenants/:tenantId/memberships',
    { preHandler: tenantOwnerGuard },
    makeCreateTenantMembershipHandler(deps.createTenantMembershipUseCase)
  );

  server.post(
    '/tenants/:tenantId/memberships/:userId/revoke',
    { preHandler: tenantOwnerGuard },
    makeRevokeTenantMembershipHandler(deps.revokeTenantMembershipUseCase)
  );

  server.patch(
    '/tenants/:tenantId/memberships/:userId/role',
    { preHandler: tenantOwnerGuard },
    makeUpdateTenantMembershipRoleHandler(deps.updateTenantMembershipRoleUseCase)
  );
};
