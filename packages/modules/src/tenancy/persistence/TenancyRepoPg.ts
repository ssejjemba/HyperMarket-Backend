import type { Kysely, Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { TenantMembership } from '../domain/Tenant';
import type {
  CreateTenantInput,
  CreateTenancyRepositoryOptions,
  TenancyRepository
} from './TenancyRepository';
import { createTenantDomainRepoPg } from './TenantDomainRepoPg';
import { createTenantMembershipRepoPg } from './TenantMembershipRepoPg';
import { createTenantRepoPg } from './TenantRepoPg';
import { createTenantSettingsRepoPg } from './TenantSettingsRepoPg';
import { mapMembership } from './mappers';

export const createTenancyRepository = (
  db: Kysely<DatabaseSchema>,
  options: CreateTenancyRepositoryOptions = {}
): TenancyRepository => {
  const tenantRepo = createTenantRepoPg(db);
  const domainRepo = createTenantDomainRepoPg(db, options);
  const membershipRepo = createTenantMembershipRepoPg(db);
  const settingsRepo = createTenantSettingsRepoPg(db);

  const createTenant = async (trx: Transaction<DatabaseSchema>, input: CreateTenantInput) => {
    const tenant = await createTenantRepoPg(trx).createTenant(trx, {
      name: input.name,
      slug: input.slug
    });

    await createTenantMembershipRepoPg(trx).createMembership(tenant.id, input.ownerUserId, 'owner');
    await createTenantDomainRepoPg(trx, options).createDomainMapping({
      tenantId: tenant.id,
      domain: input.domain,
      type: 'subdomain',
      status: 'verified',
      isPrimary: true
    });

    return tenant;
  };

  const listTenantsForUser = (userId: string) => tenantRepo.listForUser(userId);
  const getTenantById = (tenantId: string) => tenantRepo.findById(tenantId);
  const getTenantSettings = (tenantId: string) => settingsRepo.getSettings(tenantId);
  const resolveTenantByDomain = (hostname: string) => domainRepo.findTenantIdByDomain(hostname);
  const getMembershipsForUser = async (userId: string) =>
    (await membershipRepo.listMemberships(userId)).map(mapMembership);
  const getMembership = async (
    userId: string,
    tenantId: string
  ): Promise<TenantMembership | null> => {
    const membership = await membershipRepo.findMembership(tenantId, userId);
    return membership === null ? null : mapMembership(membership);
  };

  return {
    createTenant,
    listTenantsForUser,
    getTenantById,
    getTenantSettings,
    resolveTenantByDomain,
    getMembershipsForUser,
    getMembership
  };
};
