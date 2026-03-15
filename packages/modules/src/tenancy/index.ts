import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import {
  createCreateTenantMembershipUseCase,
  createCreateTenantUseCase,
  createGetTenantUseCase,
  createGetTenantSettingsUseCase,
  createListTenantMembershipsUseCase,
  createListTenantsUseCase,
  createUpdateTenantSettingsUseCase
} from './application';
import { registerTenancyApiRoutes } from './api/routes';
import { createTenantDomainRepoPg } from './persistence/TenantDomainRepoPg';
import { createTenantMembershipRepoPg } from './persistence/TenantMembershipRepoPg';
import { createMembershipReaderPg } from './persistence/TenancyMembershipReaderPg';
import { createTenantRepoPg } from './persistence/TenantRepoPg';
import { createTenantSettingsRepoPg } from './persistence/TenantSettingsRepoPg';

export const registerTenancyRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  const sessionRepo = createSessionRepoPg(deps.db);
  const tokenSigner = createTokenSigner({
    secret: deps.config.jwtSecret,
    ttlSeconds: deps.config.sessionTtlSeconds,
    issuer: deps.config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: deps.config.sessionTtlSeconds
  });
  const createTenantUseCase = createCreateTenantUseCase({
    db: deps.db,
    platformRootDomain: deps.config.platformRootDomain
  });
  const createTenantMembershipUseCase = createCreateTenantMembershipUseCase({
    db: deps.db
  });
  const tenantRepo = createTenantRepoPg(deps.db);
  const domainRepo = createTenantDomainRepoPg(deps.db, {
    platformRootDomain: deps.config.platformRootDomain
  });
  const listTenantsUseCase = createListTenantsUseCase({
    tenantRepo,
    domainRepo
  });
  const listTenantMembershipsUseCase = createListTenantMembershipsUseCase({
    membershipRepo: createTenantMembershipRepoPg(deps.db)
  });
  const getTenantUseCase = createGetTenantUseCase({
    tenantRepo,
    domainRepo
  });
  const getTenantSettingsUseCase = createGetTenantSettingsUseCase({
    settingsRepo: createTenantSettingsRepoPg(deps.db)
  });
  const updateTenantSettingsUseCase = createUpdateTenantSettingsUseCase({
    db: deps.db
  });
  const membershipReader = createMembershipReaderPg(deps.db);

  await registerTenancyApiRoutes(server, {
    logger: deps.logger,
    createTenantMembershipUseCase,
    createTenantUseCase,
    getTenantUseCase,
    getTenantSettingsUseCase,
    listTenantMembershipsUseCase,
    listTenantsUseCase,
    updateTenantSettingsUseCase,
    sessionService,
    membershipReader
  });
};

export { TenancyError } from './errors/TenancyError';
export type { TenancyErrorCode } from './errors/TenancyError';
export { DomainName } from './domain/DomainName';
export type { MembershipReader } from './MembershipReader';
export type {
  MembershipClaim as TenancyMembershipClaim,
  MembershipStatus
} from './domain/MembershipClaim';
export { TenantSlug } from './domain/TenantSlug';
export type { ResolvedTenant, TenantResolutionCache, TenantResolver } from './TenantResolver';
export { createCreateTenantMembershipUseCase, createCreateTenantUseCase } from './application';
export type {
  CreateTenantMembershipInput as CreateTenantMembershipUseCaseInput,
  CreateTenantMembershipOutput,
  CreateTenantMembershipUseCase,
  CreateTenantMembershipUseCaseDeps,
  CreateTenantInput as CreateTenantUseCaseInput,
  CreateTenantOutput,
  CreateTenantUseCase,
  CreateTenantUseCaseDeps,
  GetTenantUseCase,
  GetTenantUseCaseDeps,
  GetTenantSettingsUseCase,
  GetTenantSettingsUseCaseDeps,
  ListTenantMembershipsUseCase,
  ListTenantMembershipsUseCaseDeps,
  ListTenantsUseCase,
  ListTenantsUseCaseDeps,
  TenantMembershipSummary,
  TenantSummary,
  UpdateTenantSettingsInput,
  UpdateTenantSettingsUseCase,
  UpdateTenantSettingsUseCaseDeps
} from './application';
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
export { createNoopTenantResolutionCache } from './persistence/NoopTenantResolutionCache';
export { createTenantResolverPg } from './persistence/TenantResolverPg';
