import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { createDbClient, sql } from '../../packages/core/src/db/index';
import { loadEnv } from '../../packages/core/src/config/loadEnv';
import { buildNotificationPlan } from '../../packages/modules/src/notifications';
import { createOrderUseCases } from '../../packages/modules/src/orders/application/useCases';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '../..');

loadDotenv({ path: path.join(rootDir, '.env.example') });
loadDotenv({ path: path.join(rootDir, '.env'), override: true });

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
};

const run = async (): Promise<void> => {
  const config = loadEnv();
  const db = createDbClient(config.databaseUrl);
  const suffix = Date.now().toString().slice(-12).padStart(12, '0');
  const productId = `40000000-0000-0000-0000-${suffix}`;
  const tenantId = `30000000-0000-0000-0000-${suffix}`;
  const userId = `50000000-0000-0000-0000-${suffix}`;

  await ensureOrdersTables(db);
  await ensureFulfillmentTables(db);

  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      slug: `ord-a-${suffix}`,
      business_name: 'Orders A',
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
      name: 'Bread',
      slug: 'bread',
      description: null,
      status: 'active',
      primary_image_asset_id: null,
      price_amount: 2500,
      compare_at_price_amount: null,
      currency: 'UGX',
      track_inventory: true,
      stock_quantity: 5,
      sku: 'BREAD-1',
      attributes: {},
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null
    })
    .execute();

  await db
    .insertInto('fulfillment_settings')
    .values({
      tenant_id: tenantId,
      pickup_enabled: true,
      delivery_enabled: false,
      pickup_instructions: null,
      delivery_instructions: null,
      business_hours: {},
      cutoff_rules: {},
      updated_at: new Date()
    })
    .onConflict((oc) =>
      oc.column('tenant_id').doUpdateSet({
        pickup_enabled: true,
        delivery_enabled: false,
        business_hours: {},
        cutoff_rules: {},
        updated_at: new Date()
      })
    )
    .execute();

  const useCases = createOrderUseCases({ db });

  const created = await useCases.createOrder({
    tenantId,
    idempotencyKey: 'integration-order-1',
    checkoutMode: 'pay_on_delivery',
    items: [
      {
        productSlug: 'bread',
        quantity: 2
      }
    ],
    customer: {
      full_name: 'Amina',
      phone_e164: '+256700000001'
    },
    fulfillment: {
      type: 'pickup',
      pickup_location_label: 'Ntinda'
    }
  });

  assert.equal(created.order.orderNumber, 1);
  assert.equal(created.order.totalAmount, 5000);
  assert.equal(created.items.length, 1);
  assert.equal(created.history.length, 1);

  const updatedProduct = await db
    .selectFrom('products')
    .select('stock_quantity')
    .where('tenant_id', '=', tenantId)
    .where('slug', '=', 'bread')
    .executeTakeFirstOrThrow();
  assert.equal(updatedProduct.stock_quantity, 3);

  const replay = await useCases.createOrder({
    tenantId,
    idempotencyKey: 'integration-order-1',
    checkoutMode: 'pay_on_delivery',
    items: [
      {
        productSlug: 'bread',
        quantity: 2
      }
    ],
    customer: {
      full_name: 'Amina',
      phone_e164: '+256700000001'
    },
    fulfillment: {
      type: 'pickup',
      pickup_location_label: 'Ntinda'
    }
  });

  assert.equal(replay.order.id, created.order.id);

  await assert.rejects(
    () =>
      useCases.createOrder({
        tenantId,
        idempotencyKey: 'integration-order-oversell',
        checkoutMode: 'pay_on_delivery',
        items: [
          {
            productSlug: 'bread',
            quantity: 4
          }
        ],
        customer: {
          full_name: 'Amina',
          phone_e164: '+256700000001'
        },
        fulfillment: {
          type: 'pickup',
          pickup_location_label: 'Ntinda'
        }
      }),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'order_product_not_available'
  );

  const transitioned = await useCases.transitionOrder({
    tenantId,
    orderId: created.order.id,
    actorUserId: userId,
    action: 'confirm',
    reason: 'Accepted'
  });

  assert.equal(transitioned.order.status, 'CONFIRMED');
  assert.equal(transitioned.history[0]?.toStatus, 'CONFIRMED');

  const outboxEvents = await db
    .selectFrom('outbox_events')
    .select([
      'id',
      'event_type',
      'tenant_id',
      'payload',
      'occurred_at',
      'available_at',
      'attempts',
      'last_error',
      'created_at'
    ])
    .where('tenant_id', '=', tenantId)
    .orderBy('created_at', 'asc')
    .execute();

  assert.deepEqual(
    outboxEvents.map((event) => event.event_type),
    ['Order.Created', 'Order.StateChanged']
  );

  const createdEvent = outboxEvents[0];
  assert.deepEqual(createdEvent?.payload, {
    tenant_id: tenantId,
    order_id: created.order.id,
    order_number: 1,
    status: 'PENDING',
    total_amount: 5000,
    currency: 'UGX',
    store_name: 'Orders A',
    customer_phone_e164: '+256700000001',
    merchant_phone_e164: null,
    fulfillment_type: 'pickup',
    created_at: created.order.createdAt.toISOString()
  });

  const createdPlan = buildNotificationPlan({
    id: createdEvent.id,
    eventType: createdEvent.event_type,
    tenantId: createdEvent.tenant_id,
    correlationId: null,
    actorUserId: null,
    payload: createdEvent.payload,
    occurredAt: createdEvent.occurred_at,
    availableAt: createdEvent.available_at,
    dispatchedAt: null,
    attempts: createdEvent.attempts,
    lastError: createdEvent.last_error,
    createdAt: createdEvent.created_at
  });
  assert.equal(createdPlan.length, 1);
  assert.equal(createdPlan[0]?.templateId, 'order.created.customer');

  const stateChangedEvent = outboxEvents[1];
  assert.deepEqual(stateChangedEvent?.payload, {
    tenant_id: tenantId,
    order_id: created.order.id,
    order_number: 1,
    from_status: 'PENDING',
    to_status: 'CONFIRMED',
    action: 'confirm',
    total_amount: 5000,
    currency: 'UGX',
    store_name: 'Orders A',
    customer_phone_e164: '+256700000001',
    merchant_phone_e164: null,
    updated_at: transitioned.order.updatedAt.toISOString()
  });

  const stateChangedPlan = buildNotificationPlan({
    id: stateChangedEvent.id,
    eventType: stateChangedEvent.event_type,
    tenantId: stateChangedEvent.tenant_id,
    correlationId: null,
    actorUserId: null,
    payload: stateChangedEvent.payload,
    occurredAt: stateChangedEvent.occurred_at,
    availableAt: stateChangedEvent.available_at,
    dispatchedAt: null,
    attempts: stateChangedEvent.attempts,
    lastError: stateChangedEvent.last_error,
    createdAt: stateChangedEvent.created_at
  });
  assert.equal(stateChangedPlan.length, 1);
  assert.equal(stateChangedPlan[0]?.recipient, '+256700000001');

  await db.destroy();
};

await run();
