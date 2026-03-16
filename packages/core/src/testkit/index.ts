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

const ensureMediaTables = async (db: ReturnType<typeof createDbClient>): Promise<void> => {
  await sql`
    create table if not exists media_assets (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      storage_key text not null,
      mime_type text not null,
      byte_size bigint not null,
      width integer null,
      height integer null,
      checksum text null,
      status text not null,
      created_by_user_id uuid null references users(id) on delete set null,
      created_at timestamptz not null default now(),
      deleted_at timestamptz null
    )
  `.execute(db);
  await sql`
    create unique index if not exists media_assets_tenant_storage_key_unique
    on media_assets (tenant_id, storage_key)
  `.execute(db);
  await sql`
    create index if not exists media_assets_tenant_created_at_idx
    on media_assets (tenant_id, created_at desc)
  `.execute(db);
  await sql`
    create index if not exists media_assets_tenant_status_created_at_idx
    on media_assets (tenant_id, status, created_at desc)
  `.execute(db);
};

const ensureCatalogMediaForeignKey = async (
  db: ReturnType<typeof createDbClient>
): Promise<void> => {
  await sql`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'products_primary_image_asset_id_foreign'
      ) then
        alter table products
        add constraint products_primary_image_asset_id_foreign
        foreign key (primary_image_asset_id)
        references media_assets(id)
        on delete set null;
      end if;
    end
    $$;
  `.execute(db);
};

const ensureOrdersTables = async (db: ReturnType<typeof createDbClient>): Promise<void> => {
  await sql`
    create table if not exists customers (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      full_name text null,
      phone_e164 text null,
      email text null,
      notes text null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists orders (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      order_number bigint not null,
      status text not null,
      checkout_mode text not null,
      currency text not null default 'UGX',
      subtotal_amount integer not null,
      delivery_fee_amount integer not null default 0,
      discount_amount integer not null default 0,
      total_amount integer not null,
      customer_id uuid null references customers(id) on delete set null,
      customer_snapshot jsonb not null,
      fulfillment_snapshot jsonb not null,
      notes text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists order_items (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      order_id uuid not null references orders(id) on delete cascade,
      product_id uuid null references products(id) on delete set null,
      variant_id uuid null references product_variants(id) on delete set null,
      title text not null,
      sku text null,
      quantity integer not null,
      unit_price_amount integer not null,
      line_total_amount integer not null,
      image_url text null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists order_state_history (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      order_id uuid not null references orders(id) on delete cascade,
      from_status text null,
      to_status text not null,
      reason text null,
      actor_type text not null,
      actor_user_id uuid null references users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create unique index if not exists orders_tenant_order_number_unique
    on orders (tenant_id, order_number)
  `.execute(db);
};

const ensurePaymentsTables = async (db: ReturnType<typeof createDbClient>): Promise<void> => {
  await sql`
    create table if not exists payment_intents (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      order_id uuid not null references orders(id) on delete cascade,
      provider text not null,
      method text not null,
      status text not null,
      amount integer not null,
      currency text not null default 'UGX',
      tx_ref text not null default '',
      provider_reference text null,
      provider_transaction_id text null,
      customer_phone_e164 text null,
      customer_email text not null default '',
      network text not null default '',
      failure_code text null,
      failure_message text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    alter table payment_intents
    add column if not exists tx_ref text not null default ''
  `.execute(db);
  await sql`
    alter table payment_intents
    add column if not exists provider_transaction_id text null
  `.execute(db);
  await sql`
    alter table payment_intents
    add column if not exists customer_email text not null default ''
  `.execute(db);
  await sql`
    alter table payment_intents
    add column if not exists network text not null default ''
  `.execute(db);
  await sql`
    create table if not exists payment_provider_events (
      id uuid primary key default gen_random_uuid(),
      provider text not null,
      provider_event_id text not null,
      tenant_id uuid null references tenants(id) on delete set null,
      intent_id uuid null references payment_intents(id) on delete set null,
      order_id uuid null references orders(id) on delete set null,
      payload jsonb not null,
      received_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create unique index if not exists payment_provider_events_provider_provider_event_id_unique
    on payment_provider_events (provider, provider_event_id)
  `.execute(db);
  await sql`
    create unique index if not exists payment_intents_provider_tx_ref_idx
    on payment_intents (provider, tx_ref)
  `.execute(db);
  await sql`
    create index if not exists payment_intents_provider_transaction_id_idx
    on payment_intents (provider, provider_transaction_id)
    where provider_transaction_id is not null
  `.execute(db);
};

export const resetDatabase = async (): Promise<void> => {
  const config = loadEnv();
  const db = createDbClient(config.databaseUrl);

  await ensureTenantSettingsWhatsappColumn(db);
  await ensureTenantMembershipRevokedAtColumn(db);
  await ensureCatalogTables(db);
  await ensureMediaTables(db);
  await ensureCatalogMediaForeignKey(db);
  await ensureOrdersTables(db);
  await ensurePaymentsTables(db);
  await db.deleteFrom('auth_otps').execute();
  await db.deleteFrom('sessions').execute();
  await db.deleteFrom('publish_history').execute();
  await db.deleteFrom('payment_provider_events').execute();
  await db.deleteFrom('payment_intents').execute();
  await db.deleteFrom('order_state_history').execute();
  await db.deleteFrom('order_items').execute();
  await db.deleteFrom('orders').execute();
  await db.deleteFrom('customers').execute();
  await db.deleteFrom('media_assets').execute();
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
  await ensureMediaTables(db);
  await ensureCatalogMediaForeignKey(db);
  await ensureOrdersTables(db);
  await ensurePaymentsTables(db);

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
    await ensureMediaTables(db);
    await ensureCatalogMediaForeignKey(db);
    await ensureOrdersTables(db);
    await ensurePaymentsTables(db);
    await db.selectFrom('store_configs').select('id').limit(1).execute();
    await db.selectFrom('tenants').select('id').limit(1).execute();
    await db.selectFrom('products').select('id').limit(1).execute();
    await db.selectFrom('media_assets').select('id').limit(1).execute();
    await db.selectFrom('orders').select('id').limit(1).execute();
    await db.selectFrom('payment_intents').select('id').limit(1).execute();
    await db.destroy();
    return true;
  } catch {
    return false;
  }
};
