import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import { DomainName } from '../domain/DomainName';
import type { Tenant, TenantMembership, TenantSettings } from '../domain/Tenant';
import { TenantSlug } from '../domain/TenantSlug';
import type {
  CreateTenantInput,
  CreateTenancyRepositoryOptions,
  TenancyRepository
} from './TenancyRepository';

export const createTenancyRepository = (
  db: Kysely<DatabaseSchema>,
  options: CreateTenancyRepositoryOptions = {}
): TenancyRepository => {
  const createTenant = async (
    trx: Transaction<DatabaseSchema>,
    input: CreateTenantInput
  ): Promise<Tenant> => {
    const slug = TenantSlug.parse(input.slug);
    const domain = DomainName.parseSubdomain(input.domain, slug, options.platformRootDomain ?? '');

    const tenantRow = await trx
      .insertInto('tenants')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        business_name: input.name,
        slug: slug.toString(),
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
        domain: domain.toString(),
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
      status: tenantRow.status,
      defaultCurrency: tenantRow.default_currency,
      activeConfigId: tenantRow.active_config_id,
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
        'tenants.business_name as business_name',
        'tenants.slug as slug',
        'tenants.status as status',
        'tenants.default_currency as default_currency',
        'tenants.active_config_id as active_config_id',
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
      status: row.status,
      defaultCurrency: row.default_currency,
      activeConfigId: row.active_config_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  };

  const getTenantById = async (tenantId: string): Promise<Tenant | null> => {
    const row = await db
      .selectFrom('tenants')
      .select([
        'id',
        'business_name',
        'slug',
        'status',
        'default_currency',
        'active_config_id',
        'created_at',
        'updated_at'
      ])
      .where('id', '=', tenantId)
      .executeTakeFirst();

    return row === undefined
      ? null
      : {
          id: row.id,
          name: row.business_name,
          slug: row.slug,
          isActive: row.status === 'active',
          status: row.status,
          defaultCurrency: row.default_currency,
          activeConfigId: row.active_config_id,
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
      .where('domain', '=', hostname)
      .executeTakeFirst();

    return row?.tenant_id ?? null;
  };

  const getMembershipsForUser = async (userId: string): Promise<TenantMembership[]> => {
    const rows = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'role', 'status'])
      .where('user_id', '=', userId)
      .execute();

    return rows.map((row) => ({
      tenantId: row.tenant_id,
      role: row.role,
      isActive: row.status === 'active',
      status: row.status
    }));
  };

  const getMembership = async (
    userId: string,
    tenantId: string
  ): Promise<TenantMembership | null> => {
    const row = await db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'role', 'status'])
      .where('user_id', '=', userId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return row === undefined
      ? null
      : {
          tenantId: row.tenant_id,
          role: row.role,
          isActive: row.status === 'active',
          status: row.status
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
