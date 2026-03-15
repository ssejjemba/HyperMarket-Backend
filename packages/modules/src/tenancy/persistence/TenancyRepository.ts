import type { Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { Tenant, TenantMembership, TenantSettings } from '../domain/Tenant';

export type CreateTenantInput = {
  name: string;
  slug: string;
  ownerUserId: string;
  domain: string;
};

export interface TenancyRepository {
  createTenant(trx: Transaction<DatabaseSchema>, input: CreateTenantInput): Promise<Tenant>;
  listTenantsForUser(userId: string): Promise<Tenant[]>;
  getTenantById(tenantId: string): Promise<Tenant | null>;
  getTenantSettings(tenantId: string): Promise<TenantSettings>;
  resolveTenantByDomain(hostname: string): Promise<string | null>;
  getMembershipsForUser(userId: string): Promise<TenantMembership[]>;
  getMembership(userId: string, tenantId: string): Promise<TenantMembership | null>;
}
