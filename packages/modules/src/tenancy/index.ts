import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { registerTenancyApiRoutes } from './api/routes';

export const registerTenancyRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  await registerTenancyApiRoutes(server, { logger: deps.logger });
};

export type { MembershipReader } from './MembershipReader';
export type { TenantResolver } from './TenantResolver';
export type { Tenant, TenantMembership, TenantSettings } from './domain/Tenant';
export type { CreateTenantInput, TenancyRepository } from './persistence/TenancyRepository';
export { createTenancyRepository } from './persistence/TenancyRepoPg';
export { createMembershipReaderPg } from './persistence/TenancyMembershipReaderPg';
export { createTenantResolverPg } from './persistence/TenantResolverPg';
