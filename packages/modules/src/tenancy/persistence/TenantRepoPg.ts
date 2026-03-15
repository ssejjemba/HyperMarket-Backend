import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import { TenantSlug } from '../domain/TenantSlug';
import type { TenantRepository, CreateTenantInput } from './TenantRepository';
import { mapTenantRow } from './mappers';

export const createTenantRepoPg = (db: Kysely<DatabaseSchema>): TenantRepository => {
  const createTenant = async (trx: Transaction<DatabaseSchema>, input: CreateTenantInput) => {
    const slug = TenantSlug.parse(input.slug);
    const row = await trx
      .insertInto('tenants')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        business_name: input.name,
        slug: slug.toString(),
        status: input.status ?? 'active',
        default_currency: input.defaultCurrency ?? 'UGX',
        active_config_id: input.activeConfigId ?? null,
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapTenantRow(row);
  };

  const findById = async (tenantId: string) => {
    const row = await db
      .selectFrom('tenants')
      .selectAll()
      .where('id', '=', tenantId)
      .executeTakeFirst();
    return row === undefined ? null : mapTenantRow(row);
  };

  const findBySlug = async (slugInput: string) => {
    const slug = TenantSlug.parse(slugInput);
    const row = await db
      .selectFrom('tenants')
      .selectAll()
      .where('slug', '=', slug.toString())
      .executeTakeFirst();

    return row === undefined ? null : mapTenantRow(row);
  };

  const listForUser = async (userId: string) => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .innerJoin('tenants', 'tenants.id', 'tenant_memberships.tenant_id')
      .select([
        'tenants.id',
        'tenants.business_name',
        'tenants.slug',
        'tenants.status',
        'tenants.default_currency',
        'tenants.active_config_id',
        'tenants.created_at',
        'tenants.updated_at'
      ])
      .where('tenant_memberships.user_id', '=', userId)
      .execute();

    return rows.map((row) => mapTenantRow(row));
  };

  return {
    createTenant,
    findById,
    findBySlug,
    listForUser
  };
};
