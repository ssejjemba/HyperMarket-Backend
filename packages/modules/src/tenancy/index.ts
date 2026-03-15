import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { registerTenancyApiRoutes } from './api/routes';

export const registerTenancyRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  await registerTenancyApiRoutes(server, { logger: deps.logger });
};

export { TenancyError } from './errors/TenancyError';
export type { TenancyErrorCode } from './errors/TenancyError';
export { DomainName } from './domain/DomainName';
export type { MembershipReader } from './MembershipReader';
export { TenantSlug } from './domain/TenantSlug';
export type { TenantResolver } from './TenantResolver';
export type { Tenant, TenantMembership, TenantSettings } from './domain/Tenant';
export type {
  CreateTenantInput,
  CreateTenancyRepositoryOptions,
  TenancyRepository
} from './persistence/TenancyRepository';
export { createTenancyRepository } from './persistence/TenancyRepoPg';
export { createMembershipReaderPg } from './persistence/TenancyMembershipReaderPg';
export { createTenantResolverPg } from './persistence/TenantResolverPg';
