import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDbClient, sql } from '@hypermarket/core/db';
import {
  createNotificationUseCases,
  type NotificationProvider
} from '@hypermarket/modules/notifications';
import { createOrderUseCases } from '@hypermarket/modules/orders';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://hypermarket:hypermarket@localhost:5432/hypermarket';

const ensureTables = async (db: ReturnType<typeof createDbClient>): Promise<void> => {
  await sql`
    create table if not exists tenants (
      id uuid primary key,
      slug text not null,
      business_name text not null,
      status text not null,
      default_currency text not null,
      active_config_id uuid null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists tenant_settings (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      contact_name text null,
      contact_email text null,
      contact_phone_e164 text null,
      contact_whatsapp_e164 text null,
      social_links jsonb not null default '{}'::jsonb,
      business_hours jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists products (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      slug text not null,
      description text null,
      status text not null,
      primary_image_asset_id uuid null,
      price_amount integer not null,
      compare_at_price_amount integer null,
      currency text not null,
      track_inventory boolean not null,
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
      id uuid primary key,
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
      category_id uuid not null,
      created_at timestamptz not null default now(),
      primary key (tenant_id, product_id, category_id)
    )
  `.execute(db);
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
      actor_user_id uuid null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists outbox_events (
      id uuid primary key,
      event_type text not null,
      tenant_id uuid null references tenants(id) on delete cascade,
      correlation_id text null,
      actor_user_id uuid null,
      payload jsonb not null,
      occurred_at timestamptz not null,
      available_at timestamptz not null,
      dispatched_at timestamptz null,
      attempts integer not null default 0,
      last_error text null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists idempotency_keys (
      id uuid primary key,
      tenant_id uuid not null,
      operation text not null,
      idempotency_key text not null,
      request_hash text not null,
      response_ref text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists audit_events (
      id uuid primary key,
      tenant_id uuid not null,
      actor_user_id uuid null,
      action text not null,
      target_type text not null,
      target_id text not null,
      before jsonb null,
      after jsonb null,
      request_id text null,
      occurred_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists notification_jobs (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      event_id uuid not null references outbox_events(id) on delete cascade,
      event_type text not null,
      channel text not null,
      recipient text not null,
      template_id text not null,
      template_version integer not null,
      payload jsonb not null,
      dedupe_key text not null,
      status text not null,
      attempt_count integer not null default 0,
      last_error_code text null,
      last_error_message text null,
      provider text null,
      provider_message_id text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists notification_delivery_attempts (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      job_id uuid not null references notification_jobs(id) on delete cascade,
      attempt_number integer not null,
      provider text not null,
      result text not null,
      error_code text null,
      error_message text null,
      provider_message_id text null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
};

const seedTenant = async (db: ReturnType<typeof createDbClient>, tenantId: string) => {
  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      slug: `tenant-${tenantId.slice(0, 8)}`,
      business_name: 'Notifications Tenant',
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();
};

const seedTenantSettings = async (db: ReturnType<typeof createDbClient>, tenantId: string) => {
  await db
    .insertInto('tenant_settings')
    .values({
      tenant_id: tenantId,
      contact_name: 'Store Owner',
      contact_email: 'owner@example.com',
      contact_phone_e164: '+256700000040',
      contact_whatsapp_e164: '+256700000041',
      social_links: {},
      business_hours: {},
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();
};

const seedProduct = async (db: ReturnType<typeof createDbClient>, tenantId: string) => {
  const productId = randomUUID();
  const productSlug = `fresh-milk-${productId.slice(0, 8)}`;

  await db
    .insertInto('products')
    .values({
      id: productId,
      tenant_id: tenantId,
      name: 'Fresh Milk',
      slug: productSlug,
      description: null,
      status: 'active',
      primary_image_asset_id: null,
      price_amount: 3500,
      compare_at_price_amount: null,
      currency: 'UGX',
      track_inventory: true,
      stock_quantity: 12,
      sku: 'MILK-1L',
      attributes: {},
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null
    })
    .execute();

  return {
    productId,
    productSlug
  };
};

const logger = {
  info: vi.fn(),
  error: vi.fn()
} as never;

describe('NOT end-to-end flow', () => {
  let db: ReturnType<typeof createDbClient> | undefined;
  let tenantId: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();

    if (db !== undefined && tenantId !== undefined) {
      await db.deleteFrom('audit_events').where('tenant_id', '=', tenantId).execute();
      await db.deleteFrom('idempotency_keys').where('tenant_id', '=', tenantId).execute();
      await db.deleteFrom('tenants').where('id', '=', tenantId).execute();
    }

    if (db !== undefined) {
      await db.destroy();
    }

    db = undefined;
    tenantId = undefined;
  });

  it('dedupes duplicate order events and delivers customer and merchant alerts', async () => {
    db = createDbClient(databaseUrl);
    await ensureTables(db);
    tenantId = randomUUID();
    await seedTenant(db, tenantId);
    await seedTenantSettings(db, tenantId);
    const product = await seedProduct(db, tenantId);

    const provider: NotificationProvider = {
      providerName: 'fake_sms',
      send: vi.fn().mockResolvedValue({
        status: 'SENT',
        provider: 'fake_sms',
        providerMessageId: 'MSG-1',
        retryable: false
      })
    };

    const orders = createOrderUseCases({ db });
    const notifications = createNotificationUseCases({
      db,
      logger,
      provider
    });

    const createdOrder = await orders.createOrder({
      tenantId,
      idempotencyKey: 'notification-e2e-order-1',
      checkoutMode: 'pay_on_delivery',
      items: [{ productSlug: product.productSlug, quantity: 1 }],
      customer: {
        full_name: 'Amina',
        phone_e164: '+256700000031'
      },
      fulfillment: {
        type: 'pickup',
        pickup_location_label: 'Acacia Mall'
      }
    });

    const event = await db
      .selectFrom('outbox_events')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('event_type', '=', 'Order.Created')
      .where('payload', '@>', {
        order_id: createdOrder.order.id
      })
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();

    const scheduled = await notifications.scheduleFromOutboxEvent({
      id: event.id,
      eventType: event.event_type,
      tenantId: event.tenant_id,
      correlationId: event.correlation_id,
      actorUserId: event.actor_user_id,
      payload: event.payload,
      occurredAt: event.occurred_at,
      availableAt: event.available_at,
      dispatchedAt: event.dispatched_at,
      attempts: event.attempts,
      lastError: event.last_error,
      createdAt: event.created_at
    });

    expect(scheduled).toMatchObject({
      createdCount: 2,
      dedupedCount: 0
    });

    const replay = await notifications.scheduleFromOutboxEvent({
      id: event.id,
      eventType: event.event_type,
      tenantId: event.tenant_id,
      correlationId: event.correlation_id,
      actorUserId: event.actor_user_id,
      payload: event.payload,
      occurredAt: event.occurred_at,
      availableAt: event.available_at,
      dispatchedAt: event.dispatched_at,
      attempts: event.attempts,
      lastError: event.last_error,
      createdAt: event.created_at
    });

    expect(replay).toMatchObject({
      createdCount: 0,
      dedupedCount: 2
    });

    for (const jobId of scheduled.createdJobIds) {
      await notifications.dispatchJob(jobId);
    }

    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(provider.send)
        .mock.calls.map(([message]) => message.recipient)
        .sort()
    ).toEqual(['+256700000031', '+256700000041']);

    const jobs = await db
      .selectFrom('notification_jobs')
      .select(['recipient', 'status', 'provider_message_id'])
      .where('event_id', '=', event.id)
      .orderBy('recipient', 'asc')
      .execute();

    expect(jobs).toEqual([
      {
        recipient: '+256700000031',
        status: 'SENT',
        provider_message_id: 'MSG-1'
      },
      {
        recipient: '+256700000041',
        status: 'SENT',
        provider_message_id: 'MSG-1'
      }
    ]);
  });

  it('marks retryable dispatch failures as FAILED_RETRYABLE', async () => {
    db = createDbClient(databaseUrl);
    await ensureTables(db);
    tenantId = randomUUID();
    await seedTenant(db, tenantId);

    const provider: NotificationProvider = {
      providerName: 'fake_sms',
      send: vi.fn().mockResolvedValue({
        status: 'FAILED',
        provider: 'fake_sms',
        errorCode: 'not_provider_rate_limited',
        errorMessage: 'rate limited',
        retryable: true
      })
    };
    const notifications = createNotificationUseCases({
      db,
      logger,
      provider
    });
    const outboxId = randomUUID();

    await db
      .insertInto('outbox_events')
      .values({
        id: outboxId,
        event_type: 'Payment.Failed',
        tenant_id: tenantId,
        correlation_id: null,
        actor_user_id: null,
        payload: {
          tenant_id: tenantId
        },
        occurred_at: new Date(),
        available_at: new Date(),
        dispatched_at: null,
        attempts: 0,
        last_error: null,
        created_at: new Date()
      })
      .execute();

    const insertedJob = await db
      .insertInto('notification_jobs')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        event_id: outboxId,
        event_type: 'Payment.Failed',
        channel: 'sms',
        recipient: '+256712345678',
        template_id: 'payment.failed.customer',
        template_version: 1,
        payload: {
          order_number: 44,
          store_name: 'Sunrise Fresh'
        },
        dedupe_key: randomUUID(),
        status: 'PENDING',
        attempt_count: 0,
        last_error_code: null,
        last_error_message: null,
        provider: null,
        provider_message_id: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const result = await notifications.dispatchJob(insertedJob.id);
    expect(result.status).toBe('FAILED_RETRYABLE');
    expect(result.lastErrorCode).toBe('not_provider_rate_limited');
  });

  it('marks non-retryable dispatch failures as DEAD', async () => {
    db = createDbClient(databaseUrl);
    await ensureTables(db);
    tenantId = randomUUID();
    await seedTenant(db, tenantId);

    const provider: NotificationProvider = {
      providerName: 'fake_sms',
      send: vi.fn().mockResolvedValue({
        status: 'FAILED',
        provider: 'fake_sms',
        errorCode: 'not_recipient_invalid',
        errorMessage: 'invalid destination',
        retryable: false
      })
    };
    const notifications = createNotificationUseCases({
      db,
      logger,
      provider
    });
    const outboxId = randomUUID();

    await db
      .insertInto('outbox_events')
      .values({
        id: outboxId,
        event_type: 'Payment.Failed',
        tenant_id: tenantId,
        correlation_id: null,
        actor_user_id: null,
        payload: {
          tenant_id: tenantId
        },
        occurred_at: new Date(),
        available_at: new Date(),
        dispatched_at: null,
        attempts: 0,
        last_error: null,
        created_at: new Date()
      })
      .execute();

    const insertedJob = await db
      .insertInto('notification_jobs')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        event_id: outboxId,
        event_type: 'Payment.Failed',
        channel: 'sms',
        recipient: '+256712345678',
        template_id: 'payment.failed.customer',
        template_version: 1,
        payload: {
          order_number: 45,
          store_name: 'Sunrise Fresh'
        },
        dedupe_key: randomUUID(),
        status: 'PENDING',
        attempt_count: 0,
        last_error_code: null,
        last_error_message: null,
        provider: null,
        provider_message_id: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const result = await notifications.dispatchJob(insertedJob.id);
    expect(result.status).toBe('DEAD');
    expect(result.lastErrorCode).toBe('not_recipient_invalid');
  });
});
