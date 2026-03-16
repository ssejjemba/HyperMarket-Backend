import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { createDbClient, sql } from '../../packages/core/src/db/index';
import { loadEnv } from '../../packages/core/src/config/loadEnv';
import { createOrderPaymentPort } from '../../packages/modules/src/orders';
import { createPaymentUseCases, signMockMomoWebhook } from '../../packages/modules/src/payments';

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
      provider_reference text null,
      customer_phone_e164 text null,
      failure_code text null,
      failure_message text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
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
};

const run = async (): Promise<void> => {
  const config = loadEnv();
  const db = createDbClient(config.databaseUrl);
  const suffix = Date.now().toString().slice(-12).padStart(12, '0');
  const tenantId = `30000000-0000-0000-0000-${suffix}`;
  const orderId = `31000000-0000-0000-0000-${suffix}`;

  await ensureOrdersTables(db);
  await ensurePaymentsTables(db);

  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      slug: `pay-a-${suffix}`,
      business_name: 'Payments A',
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('orders')
    .values({
      id: orderId,
      tenant_id: tenantId,
      order_number: 1,
      status: 'PENDING',
      checkout_mode: 'gateway_payment',
      currency: 'UGX',
      subtotal_amount: 4500,
      delivery_fee_amount: 0,
      discount_amount: 0,
      total_amount: 4500,
      customer_id: null,
      customer_snapshot: {},
      fulfillment_snapshot: {
        type: 'pickup'
      },
      notes: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  const useCases = createPaymentUseCases({
    db,
    config,
    orderPaymentPort: createOrderPaymentPort({ db })
  });

  const intent = await useCases.createIntent({
    tenantId,
    orderId,
    idempotencyKey: 'integration-pay-1',
    method: 'mobile_money',
    customerPhoneE164: '+256712345678'
  });

  assert.equal(intent.status, 'AWAITING_CUSTOMER');

  const replay = await useCases.createIntent({
    tenantId,
    orderId,
    idempotencyKey: 'integration-pay-1',
    method: 'mobile_money',
    customerPhoneE164: '+256712345678'
  });
  assert.equal(replay.id, intent.id);

  const body = {
    provider_event_id: `evt_integration_${suffix}`,
    provider_reference: intent.providerReference as string,
    status: 'succeeded' as const,
    amount: 4500,
    currency: 'UGX',
    occurred_at: new Date().toISOString()
  };

  const processed = await useCases.processWebhook({
    providerName: 'mock_momo',
    request: {
      headers: {
        'x-mock-momo-signature': signMockMomoWebhook({
          secret: config.paymentMockWebhookSecret,
          body
        })
      },
      body
    }
  });
  assert.equal(processed.duplicate, false);
  assert.equal(processed.intent.status, 'SUCCEEDED');

  const duplicate = await useCases.processWebhook({
    providerName: 'mock_momo',
    request: {
      headers: {
        'x-mock-momo-signature': signMockMomoWebhook({
          secret: config.paymentMockWebhookSecret,
          body
        })
      },
      body
    }
  });
  assert.equal(duplicate.duplicate, true);

  const order = await db
    .selectFrom('orders')
    .select(['status'])
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
  assert.equal(order.status, 'PAID');

  const providerEvents = await db
    .selectFrom('payment_provider_events')
    .select('id')
    .where('provider', '=', 'mock_momo')
    .where('provider_event_id', '=', `evt_integration_${suffix}`)
    .execute();
  assert.equal(providerEvents.length, 1);

  await db.destroy();
};

await run();
