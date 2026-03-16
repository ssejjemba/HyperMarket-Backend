import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';

import { loadEnv } from '../config/loadEnv';
import { createDbClient } from '../db/client';

const ensureTenantSettingsWhatsappColumn = async (
  db: ReturnType<typeof createDbClient>
): Promise<void> => {
  await sql`
    alter table tenant_settings
    add column if not exists contact_whatsapp_e164 text null
  `.execute(db);
};

const ensureTenantMembershipRevokedAtColumn = async (
  db: ReturnType<typeof createDbClient>
): Promise<void> => {
  await sql`
    alter table tenant_memberships
    add column if not exists revoked_at timestamptz null
  `.execute(db);
};

const ensureCatalogTables = async (db: ReturnType<typeof createDbClient>): Promise<void> => {
  await sql`
    create table if not exists categories (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      slug text not null,
      description text null,
      sort_order integer not null default 0,
      is_visible boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz null
    )
  `.execute(db);
  await sql`
    create table if not exists products (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      slug text not null,
      description text null,
      status text not null default 'draft',
      primary_image_asset_id uuid null,
      price_amount integer not null,
      compare_at_price_amount integer null,
      currency text not null default 'UGX',
      track_inventory boolean not null default false,
      stock_quantity integer null,
      sku text null,
      attributes jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz null
    )
  `.execute(db);
  await sql`
    create table if not exists product_variants (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      name text not null,
      sku text null,
      price_amount integer null,
      stock_quantity integer null,
      options jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists product_categories (
      tenant_id uuid not null references tenants(id) on delete cascade,
      product_id uuid not null references products(id) on delete cascade,
      category_id uuid not null references categories(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (tenant_id, product_id, category_id)
    )
  `.execute(db);
  await sql`
    create unique index if not exists categories_tenant_slug_unique
    on categories (tenant_id, slug)
  `.execute(db);
  await sql`
    create unique index if not exists products_tenant_slug_unique
    on products (tenant_id, slug)
  `.execute(db);
  await sql`
    create unique index if not exists product_variants_tenant_product_name_unique
    on product_variants (tenant_id, product_id, name)
  `.execute(db);
};

export const resetDatabase = async (): Promise<void> => {
  const config = loadEnv();
  const db = createDbClient(config.databaseUrl);

  await ensureTenantSettingsWhatsappColumn(db);
  await ensureTenantMembershipRevokedAtColumn(db);
  await ensureCatalogTables(db);
  await db.deleteFrom('auth_otps').execute();
  await db.deleteFrom('sessions').execute();
  await db.deleteFrom('publish_history').execute();
  await db.deleteFrom('product_categories').execute();
  await db.deleteFrom('product_variants').execute();
  await db.deleteFrom('products').execute();
  await db.deleteFrom('categories').execute();
  await db.updateTable('tenants').set({ active_config_id: null }).execute();
  await db.deleteFrom('store_configs').execute();
  await db.deleteFrom('tenant_settings').execute();
  await db.deleteFrom('tenant_memberships').execute();
  await db.deleteFrom('tenant_domains').execute();
  await db.deleteFrom('tenants').execute();
  await db.deleteFrom('users').execute();
  await db.deleteFrom('outbox_events').execute();
  await db.deleteFrom('idempotency_keys').execute();
  await db.deleteFrom('audit_events').execute();
  await db.destroy();
};

export type TestSeed = {
  tenantId: string;
  tenantDomain: string;
  tenantSlug: string;
  userId: string;
  userPhone: string;
};

const createSeed = (): TestSeed => {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const phoneSuffix = `${Math.floor(Math.random() * 1_000_000_0000)}`.padStart(10, '0');

  return {
    tenantId: randomUUID(),
    tenantDomain: `test-${suffix}.local`,
    userId: randomUUID(),
    tenantSlug: `tenant-${suffix}`,
    userPhone: `+2567${phoneSuffix.slice(0, 7)}`
  };
};

export const createTestContext = async () => {
  const config = loadEnv();
  const db = createDbClient(config.databaseUrl);
  await ensureTenantSettingsWhatsappColumn(db);
  await ensureTenantMembershipRevokedAtColumn(db);
  await ensureCatalogTables(db);

  const seed = createSeed();

  await db
    .insertInto('tenants')
    .values({
      id: seed.tenantId,
      business_name: 'Test Tenant',
      slug: seed.tenantSlug,
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: sql`now()`,
      updated_at: sql`now()`
    })
    .execute();

  await db
    .insertInto('tenant_domains')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: seed.tenantId,
      domain: seed.tenantDomain,
      domain_type: 'subdomain',
      verification_status: 'verified',
      is_primary: true,
      created_at: sql`now()`
    })
    .execute();

  await db
    .insertInto('users')
    .values({
      id: seed.userId,
      phone_e164: seed.userPhone,
      email: null,
      is_active: true,
      created_at: sql`now()`,
      updated_at: sql`now()`
    })
    .execute();

  await db
    .insertInto('tenant_memberships')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: seed.tenantId,
      user_id: seed.userId,
      role: 'owner',
      status: 'active',
      created_at: sql`now()`
    })
    .execute();

  return {
    db,
    seed,
    config,
    destroy: async () => {
      await db.destroy();
    }
  };
};

export const canConnectDatabase = async (): Promise<boolean> => {
  try {
    const config = loadEnv();
    const db = createDbClient(config.databaseUrl);
    await ensureTenantSettingsWhatsappColumn(db);
    await ensureTenantMembershipRevokedAtColumn(db);
    await ensureCatalogTables(db);
    await db.selectFrom('store_configs').select('id').limit(1).execute();
    await db.selectFrom('tenants').select('id').limit(1).execute();
    await db.selectFrom('products').select('id').limit(1).execute();
    await db.destroy();
    return true;
  } catch {
    return false;
  }
};
