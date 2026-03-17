import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { createDbClient, sql } from '../../packages/core/src/db/index';
import { createFulfillmentUseCases } from '../../packages/modules/src/fulfillment';
import { createOrderUseCases } from '../../packages/modules/src/orders/application/useCases';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '../..');

loadDotenv({ path: path.join(rootDir, '.env.example') });
loadDotenv({ path: path.join(rootDir, '.env'), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for fulfillment integration tests');
}

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

const ensureFulfillmentTables = async (db: ReturnType<typeof createDbClient>): Promise<void> => {
  await sql`
    create table if not exists fulfillment_settings (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      pickup_enabled boolean not null default true,
      delivery_enabled boolean not null default false,
      pickup_instructions text null,
      delivery_instructions text null,
      business_hours jsonb not null default '{}'::jsonb,
      cutoff_rules jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists delivery_zones (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      fee_amount integer not null,
      min_order_amount integer null,
      is_active boolean not null default true,
      sort_order integer not null default 0,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create unique index if not exists delivery_zones_tenant_name_unique
    on delivery_zones (tenant_id, name)
  `.execute(db);
};

const run = async (): Promise<void> => {
  const db = createDbClient(databaseUrl);
  const suffix = Date.now().toString().slice(-12).padStart(12, '0');
  const tenantId = `70000000-0000-0000-0000-${suffix}`;
  const userId = `71000000-0000-0000-0000-${suffix}`;
  const productId = `72000000-0000-0000-0000-${suffix}`;

  await ensureOrdersTables(db);
  await ensureFulfillmentTables(db);

  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      slug: `ful-a-${suffix}`,
      business_name: 'Fulfillment A',
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('users')
    .values({
      id: userId,
      phone_e164: `+2567${suffix.slice(-7)}`,
      email: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('products')
    .values({
      id: productId,
      tenant_id: tenantId,
      name: 'Rice',
      slug: 'rice',
      description: null,
      status: 'active',
      primary_image_asset_id: null,
      price_amount: 15000,
      compare_at_price_amount: null,
      currency: 'UGX',
      track_inventory: true,
      stock_quantity: 10,
      sku: 'RICE-1',
      attributes: {},
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null
    })
    .execute();

  const fulfillmentUseCases = createFulfillmentUseCases({ db });
  await fulfillmentUseCases.createZone({
    tenantId,
    actorUserId: userId,
    name: 'Kololo',
    feeAmount: 4000,
    minOrderAmount: 20000
  });
  await fulfillmentUseCases.updateSettings({
    tenantId,
    actorUserId: userId,
    pickupEnabled: true,
    deliveryEnabled: true
  });

  const orderUseCases = createOrderUseCases({ db });

  await assert.rejects(
    () =>
      orderUseCases.createOrder({
        tenantId,
        idempotencyKey: 'ful-order-low-min',
        checkoutMode: 'pay_on_delivery',
        items: [{ productSlug: 'rice', quantity: 1 }],
        customer: {
          full_name: 'Amina',
          phone_e164: '+256700000001'
        },
        fulfillment: {
          type: 'delivery',
          zone_name: 'Kololo',
          address_label: 'Plot 4',
          recipient_name: 'Amina',
          recipient_phone: '+256700000001'
        }
      }),
    /minimum required for delivery/
  );

  const created = await orderUseCases.createOrder({
    tenantId,
    idempotencyKey: 'ful-order-ok',
    checkoutMode: 'pay_on_delivery',
    items: [{ productSlug: 'rice', quantity: 2 }],
    customer: {
      full_name: 'Amina',
      phone_e164: '+256700000001'
    },
    fulfillment: {
      type: 'delivery',
      zone_name: 'Kololo',
      address_label: 'Plot 4',
      recipient_name: 'Amina',
      recipient_phone: '+256700000001'
    }
  });

  assert.equal(created.order.deliveryFeeAmount, 4000);
  assert.equal(created.order.totalAmount, 34000);
  assert.equal(created.order.fulfillmentSnapshot.zone_name, 'Kololo');

  await db.destroy();
};

await run();
