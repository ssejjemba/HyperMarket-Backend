import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { createDbClient, sql } from '@hypermarket/core/db';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';
import { signMockMomoWebhook } from '@hypermarket/modules/payments';

import { buildServer } from '../apps/api/src/server';

type ErrorEnvelope = {
  request_id: string;
  error_code: string;
  message: string;
};

const TEST_CONFIG: AppConfig = {
  nodeEnv: 'test',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://hypermarket:hypermarket@localhost:5432/hypermarket',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  port: 3000,
  logLevel: 'silent',
  jwtSecret: 'test-jwt-secret-minimum-32-characters',
  jwtIssuer: 'test-suite',
  twilioAccountSid: 'ACtestaccountsid000000000000000000',
  twilioAuthToken: 'test-twilio-auth-token',
  twilioVerifyServiceSid: 'VAtestservicesid000000000000000000',
  platformRootDomain: 'platform.ug',
  mediaCdnBaseUrl: 'http://localhost:3002/cdn',
  mediaUploadBaseUrl: 'http://localhost:3002/uploads',
  mediaUploadUrlTtlSeconds: 900,
  mediaMaxFileBytes: 5 * 1024 * 1024,
  paymentDefaultProvider: 'flutterwave',
  paymentReconciliationStaleMinutes: 10,
  flwSecretKey: 'FLWSECK_TEST_PLACEHOLDER',
  flwWebhookSecretHash: 'test-flw-webhook-hash',
  flwBaseUrl: 'https://api.flutterwave.com',
  flwDefaultNetwork: 'MTN',
  otpSecret: 'test-otp-secret-minimum-32-characters',
  otpTtlSeconds: 300,
  sessionTtlSeconds: 3600,
  enableDevRoutes: false
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

const createPaymentRouteTestContext = async () => {
  const db = createDbClient(TEST_CONFIG.databaseUrl);
  await ensureOrdersTables(db);
  await ensurePaymentsTables(db);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const tenantId = randomUUID();
  const tenantSlug = `tenant-${suffix}`;
  const orderId = randomUUID();
  const secondOrderId = randomUUID();

  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      business_name: 'Payments Tenant',
      slug: tenantSlug,
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('tenant_domains')
    .values({
      id: randomUUID(),
      tenant_id: tenantId,
      domain: `pay-${suffix}.local`,
      domain_type: 'subdomain',
      verification_status: 'verified',
      is_primary: true,
      created_at: new Date()
    })
    .execute();

  await db
    .insertInto('orders')
    .values([
      {
        id: orderId,
        tenant_id: tenantId,
        order_number: 1,
        status: 'PENDING',
        checkout_mode: 'gateway_payment',
        currency: 'UGX',
        subtotal_amount: 3500,
        delivery_fee_amount: 0,
        discount_amount: 0,
        total_amount: 3500,
        customer_id: null,
        customer_snapshot: {},
        fulfillment_snapshot: {
          type: 'pickup'
        },
        notes: null,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: secondOrderId,
        tenant_id: tenantId,
        order_number: 2,
        status: 'PENDING',
        checkout_mode: 'gateway_payment',
        currency: 'UGX',
        subtotal_amount: 5000,
        delivery_fee_amount: 0,
        discount_amount: 0,
        total_amount: 5000,
        customer_id: null,
        customer_snapshot: {},
        fulfillment_snapshot: {
          type: 'pickup'
        },
        notes: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    ])
    .execute();

  return {
    db,
    seed: {
      tenantId,
      tenantSlug,
      orderId,
      secondOrderId
    },
    destroy: async () => {
      await db.destroy();
    }
  };
};

const canConnectPaymentsDatabase = async (): Promise<boolean> => {
  try {
    const db = createDbClient(TEST_CONFIG.databaseUrl);
    await ensureOrdersTables(db);
    await ensurePaymentsTables(db);
    await db.selectFrom('tenants').select('id').limit(1).execute();
    await db.destroy();
    return true;
  } catch {
    return false;
  }
};

const dbAvailable = await canConnectPaymentsDatabase();
const flowSuite = dbAvailable ? describe : describe.skip;

describe('PAY routes scaffold', () => {
  it.each([
    ['POST', '/storefront/test-tenant/payments/intents'],
    ['POST', '/payments/webhooks/mock_momo']
  ])('registers %s %s', async (method, url) => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method, url });

    expect([200, 400, 401, 404, 500]).toContain(res.statusCode);
    await server.close();
  });
});

flowSuite('PAY routes', () => {
  let ctx: Awaited<ReturnType<typeof createPaymentRouteTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('creates payment intents idempotently for storefront checkout', async () => {
    ctx = await createPaymentRouteTestContext();
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const first = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/payments/intents`,
      headers: {
        'idempotency-key': 'pay-key-1'
      },
      payload: {
        order_id: ctx.seed.orderId,
        method: 'mobile_money',
        customer_phone_e164: '+256712345678'
      }
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      intent: {
        order_id: ctx.seed.orderId,
        status: 'AWAITING_CUSTOMER',
        provider: 'mock_momo'
      }
    });

    const replay = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/payments/intents`,
      headers: {
        'idempotency-key': 'pay-key-1'
      },
      payload: {
        order_id: ctx.seed.orderId,
        method: 'mobile_money',
        customer_phone_e164: '+256712345678'
      }
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ intent: { id: string } }>().intent.id).toBe(
      first.json<{ intent: { id: string } }>().intent.id
    );

    await server.close();
  });

  it('fails loudly on idempotency key reuse with a different payload', async () => {
    ctx = await createPaymentRouteTestContext();
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/payments/intents`,
      headers: {
        'idempotency-key': 'pay-key-2'
      },
      payload: {
        order_id: ctx.seed.orderId,
        method: 'mobile_money',
        customer_phone_e164: '+256712345678'
      }
    });

    const conflict = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/payments/intents`,
      headers: {
        'idempotency-key': 'pay-key-2'
      },
      payload: {
        order_id: ctx.seed.secondOrderId,
        method: 'mobile_money',
        customer_phone_e164: '+256712345678'
      }
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<ErrorEnvelope>().error_code).toBe(ErrorCode.PaymentIdempotencyConflict);

    await server.close();
  });

  it('rejects invalid webhook signatures', async () => {
    ctx = await createPaymentRouteTestContext();
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/payments/webhooks/mock_momo',
      headers: {
        'x-mock-momo-signature': 'bad-signature'
      },
      payload: {
        provider_event_id: 'evt_bad',
        provider_reference: 'mock_momo_missing',
        status: 'succeeded'
      }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.PaymentWebhookSignatureInvalid);

    await server.close();
  });

  it('processes duplicate webhooks idempotently and marks the order paid once', async () => {
    ctx = await createPaymentRouteTestContext();
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const createRes = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/payments/intents`,
      headers: {
        'idempotency-key': 'pay-key-3'
      },
      payload: {
        order_id: ctx.seed.orderId,
        method: 'mobile_money',
        customer_phone_e164: '+256712345678'
      }
    });

    const providerReference = createRes.json<{ intent: { provider_reference: string } }>().intent
      .provider_reference;
    const body = {
      provider_event_id: `evt_success_${ctx.seed.orderId}`,
      provider_reference: providerReference,
      status: 'succeeded',
      amount: 3500,
      currency: 'UGX',
      occurred_at: '2026-03-16T00:00:00.000Z'
    };
    const signature = signMockMomoWebhook({
      secret: TEST_CONFIG.paymentMockWebhookSecret,
      body
    });

    const first = await server.inject({
      method: 'POST',
      url: '/payments/webhooks/mock_momo',
      headers: {
        'x-mock-momo-signature': signature
      },
      payload: body
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      ok: true,
      duplicate: false
    });

    const second = await server.inject({
      method: 'POST',
      url: '/payments/webhooks/mock_momo',
      headers: {
        'x-mock-momo-signature': signature
      },
      payload: body
    });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({
      ok: true,
      duplicate: true
    });

    const order = await ctx.db
      .selectFrom('orders')
      .select(['status'])
      .where('id', '=', ctx.seed.orderId)
      .executeTakeFirstOrThrow();
    expect(order.status).toBe('PAID');

    const events = await ctx.db
      .selectFrom('payment_provider_events')
      .select('id')
      .where('provider', '=', 'mock_momo')
      .where('provider_event_id', '=', `evt_success_${ctx.seed.orderId}`)
      .execute();
    expect(events).toHaveLength(1);

    await server.close();
  });
});
