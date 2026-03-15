import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { Tenant, TenantMembership, TenantSettings } from '../domain/Tenant';
import type { CreateTenantInput, TenancyRepository } from './TenancyRepository';

export const createTenancyRepository = (db: Kysely<DatabaseSchema>): TenancyRepository => {
  const createTenant = async (
    trx: Transaction<DatabaseSchema>,
    input: CreateTenantInput
  ): Promise<Tenant> => {
    const tenantRow = await trx
      .insertInto('tenants')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        name: input.name,
        slug: input.slug,
        is_active: true,
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .returning(['id', 'name', 'slug', 'is_active', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('tenant_memberships')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: tenantRow.id,
        user_id: input.ownerUserId,
        role: 'owner',
        is_active: true,
        created_at: sql`now()`
      })
      .execute();

    await trx
      .insertInto('tenant_domains')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: tenantRow.id,
        hostname: input.domain,
        is_primary: true,
        created_at: sql`now()`
      })
      .execute();

    return {
      id: tenantRow.id,
      name: tenantRow.name,
      slug: tenantRow.slug,
      isActive: tenantRow.is_active,
      createdAt: tenantRow.created_at,
      updatedAt: tenantRow.updated_at
    };
  };

  const listTenantsForUser = async (userId: string): Promise<Tenant[]> => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .innerJoin('tenants', 'tenants.id', 'tenant_memberships.tenant_id')
      .select([
        'tenants.id as id',
        'tenants.name as name',
        'tenants.slug as slug',
        'tenants.is_active as is_active',
        'tenants.created_at as created_at',
        'tenants.updated_at as updated_at'
      ])
      .where('tenant_memberships.user_id', '=', userId)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  };

  const getTenantById = async (tenantId: string): Promise<Tenant | null> => {
    const row = await db
      .selectFrom('tenants')
      .select(['id', 'name', 'slug', 'is_active', 'created_at', 'updated_at'])
      .where('id', '=', tenantId)
      .executeTakeFirst();

    return row === undefined
      ? null
      : {
          id: row.id,
          name: row.name,
          slug: row.slug,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
  };

  const getTenantSettings = async (_tenantId: string): Promise<TenantSettings> => {
    return {};
  };

  const resolveTenantByDomain = async (hostname: string): Promise<string | null> => {
    const row = await db
      .selectFrom('tenant_domains')
      .select(['tenant_id'])
      .where('hostname', '=', hostname)
      .executeTakeFirst();

    return row?.tenant_id ?? null;
  };

  const getMembershipsForUser = async (userId: string): Promise<TenantMembership[]> => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'role', 'is_active'])
      .where('user_id', '=', userId)
      .execute();

    return rows.map((row) => ({
      tenantId: row.tenant_id,
      role: row.role,
      isActive: row.is_active
    }));
  };

  const getMembership = async (
    userId: string,
    tenantId: string
  ): Promise<TenantMembership | null> => {
    const row = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'role', 'is_active'])
      .where('user_id', '=', userId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return row === undefined
      ? null
      : {
          tenantId: row.tenant_id,
          role: row.role,
          isActive: row.is_active
        };
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
