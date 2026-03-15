import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

export type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MembershipRow = {
  tenantId: string;
  role: string;
  isActive: boolean;
};

export type CreateTenantInput = {
  name: string;
  slug: string;
  ownerUserId: string;
  domain: string;
};

export const createTenancyRepository = (db: Kysely<DatabaseSchema>) => {
  const createTenant = async (
    trx: Transaction<DatabaseSchema>,
    input: CreateTenantInput
  ): Promise<TenantRecord> => {
    const tenantRow = await trx
      .insertInto('tenants')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        business_name: input.name,
        slug: input.slug,
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .returning([
        'id',
        'business_name',
        'slug',
        'status',
        'default_currency',
        'active_config_id',
        'created_at',
        'updated_at'
      ])
      .executeTakeFirstOrThrow();

    await trx
      .insertInto('tenant_memberships')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: tenantRow.id,
        user_id: input.ownerUserId,
        role: 'owner',
        status: 'active',
        created_at: sql`now()`
      })
      .execute();

    await trx
      .insertInto('tenant_domains')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: tenantRow.id,
        domain: input.domain,
        domain_type: 'subdomain',
        verification_status: 'verified',
        is_primary: true,
        created_at: sql`now()`
      })
      .execute();

    return {
      id: tenantRow.id,
      name: tenantRow.business_name,
      slug: tenantRow.slug,
      isActive: tenantRow.status === 'active',
      createdAt: tenantRow.created_at,
      updatedAt: tenantRow.updated_at
    };
  };

  const listTenantsForUser = async (userId: string): Promise<TenantRecord[]> => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .innerJoin('tenants', 'tenants.id', 'tenant_memberships.tenant_id')
      .select([
        'tenants.id as id',
        'tenants.business_name as business_name',
        'tenants.slug as slug',
        'tenants.status as status',
        'tenants.created_at as created_at',
        'tenants.updated_at as updated_at'
      ])
      .where('tenant_memberships.user_id', '=', userId)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.business_name,
      slug: row.slug,
      isActive: row.status === 'active',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  };

  const resolveTenantByDomain = async (hostname: string): Promise<string | null> => {
    const row = await db
      .selectFrom('tenant_domains')
      .select(['tenant_id'])
      .where('domain', '=', hostname)
      .executeTakeFirst();

    return row?.tenant_id ?? null;
  };

  const getMembershipsForUser = async (userId: string): Promise<MembershipRow[]> => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'role', 'status'])
      .where('user_id', '=', userId)
      .execute();

    return rows.map((r) => ({
      tenantId: r.tenant_id,
      role: r.role,
      isActive: r.status === 'active'
    }));
  };

  const getMembership = async (userId: string, tenantId: string): Promise<MembershipRow | null> => {
    const row = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'role', 'status'])
      .where('user_id', '=', userId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return row !== undefined
      ? { tenantId: row.tenant_id, role: row.role, isActive: row.status === 'active' }
      : null;
  };

  return {
    createTenant,
    listTenantsForUser,
    resolveTenantByDomain,
    getMembershipsForUser,
    getMembership
  };
};
