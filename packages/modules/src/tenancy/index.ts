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
export type { TenantDomain } from './persistence/TenantDomainRepository';
export type {
  CreateTenantInput,
  CreateTenancyRepositoryOptions,
  TenancyRepository
} from './persistence/TenancyRepository';
export type {
  CreateTenantInput as CreateTenantRecordInput,
  TenantRepository
} from './persistence/TenantRepository';
export type {
  CreateDomainMappingInput,
  TenantDomainRepository
} from './persistence/TenantDomainRepository';
export type {
  TenantMembershipRecord,
  TenantMembershipRepository
} from './persistence/TenantMembershipRepository';
export type {
  TenantSettingsPatch,
  TenantSettingsRepository
} from './persistence/TenantSettingsRepository';
export { createTenancyRepository } from './persistence/TenancyRepoPg';
export { createTenantRepoPg } from './persistence/TenantRepoPg';
export { createTenantDomainRepoPg } from './persistence/TenantDomainRepoPg';
export { createTenantMembershipRepoPg } from './persistence/TenantMembershipRepoPg';
export { createTenantSettingsRepoPg } from './persistence/TenantSettingsRepoPg';
export { createMembershipReaderPg } from './persistence/TenancyMembershipReaderPg';
export { createTenantResolverPg } from './persistence/TenantResolverPg';
