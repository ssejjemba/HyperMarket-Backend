import type { Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { Tenant } from '../domain/Tenant';

export type CreateTenantInput = {
  name: string;
  slug: string;
  status?: 'active' | 'suspended' | 'archived';
  defaultCurrency?: string;
  activeConfigId?: string | null;
};

export interface TenantRepository {
  createTenant(trx: Transaction<DatabaseSchema>, input: CreateTenantInput): Promise<Tenant>;
  findById(tenantId: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  listForUser(userId: string): Promise<Tenant[]>;
}
