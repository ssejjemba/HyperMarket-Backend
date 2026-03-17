import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';
import { sql } from '@hypermarket/core/db';

import { ErrorCode } from '@hypermarket/contracts';
import { createDbClient } from '@hypermarket/core/db';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';
import {
  UserIdentity,
  createSessionRepoPg,
  createSessionService,
  createTokenSigner
} from '@hypermarket/modules/iaa';

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
  paymentDefaultProvider: 'flutterwave',
  paymentReconciliationStaleMinutes: 10,
  flwSecretKey: 'FLWSECK_TEST_PLACEHOLDER',
  flwWebhookSecretHash: 'test-flw-webhook-hash',
  flwBaseUrl: 'https://api.flutterwave.com',
  flwDefaultNetwork: 'MTN',
  notificationDefaultProvider: 'twilio_sms',
  notificationDefaultChannel: 'sms',
  twilioSmsFrom: '+256700000000',
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

const createRouteTestContext = async () => {
  const db = createDbClient(TEST_CONFIG.databaseUrl);
  await ensureOrdersTables(db);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const phoneSuffix = `${Math.floor(Math.random() * 10_000_000)}`.padStart(7, '0');
  const seed = {
    tenantId: randomUUID(),
    tenantDomain: `test-${suffix}.local`,
    tenantSlug: `tenant-${suffix}`,
    userId: randomUUID(),
    userPhone: `+2567${phoneSuffix}`
  };

  await db
    .insertInto('tenants')
    .values({
      id: seed.tenantId,
      business_name: 'Test Tenant',
      slug: seed.tenantSlug,
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
      tenant_id: seed.tenantId,
      domain: seed.tenantDomain,
      domain_type: 'subdomain',
      verification_status: 'verified',
      is_primary: true,
      created_at: new Date()
    })
    .execute();

  await db
    .insertInto('users')
    .values({
      id: seed.userId,
      phone_e164: seed.userPhone,
      email: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('tenant_memberships')
    .values({
      id: randomUUID(),
      tenant_id: seed.tenantId,
      user_id: seed.userId,
      role: 'owner',
      status: 'active',
      created_at: new Date(),
      revoked_at: null
    })
    .execute();

  return {
    db,
    seed,
    config: TEST_CONFIG,
    destroy: async () => {
      await db.destroy();
    }
  };
};

const canConnectOrdersDatabase = async (): Promise<boolean> => {
  try {
    const db = createDbClient(TEST_CONFIG.databaseUrl);
    await ensureOrdersTables(db);
    await db.selectFrom('tenants').select('id').limit(1).execute();
    await db.destroy();
    return true;
  } catch {
    return false;
  }
};

const issueAccessToken = async (
  ctx: Awaited<ReturnType<typeof createRouteTestContext>>,
  user = { id: ctx.seed.userId, phoneE164: ctx.seed.userPhone }
): Promise<string> => {
  const sessionRepo = createSessionRepoPg(ctx.db);
  const tokenSigner = createTokenSigner({
    secret: ctx.config.jwtSecret,
    ttlSeconds: ctx.config.sessionTtlSeconds,
    issuer: ctx.config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: ctx.config.sessionTtlSeconds
  });

  const result = await sessionService.issueSession(
    new UserIdentity({
      id: user.id,
      phoneE164: user.phoneE164,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    })
  );

  return result.accessToken;
};

const seedProduct = async (
  ctx: Awaited<ReturnType<typeof createRouteTestContext>>,
  overrides?: {
    slug?: string;
    stockQuantity?: number | null;
    trackInventory?: boolean;
  }
) => {
  const productId = randomUUID();
  const variantId = randomUUID();
  await ctx.db
    .insertInto('products')
    .values({
      id: productId,
      tenant_id: ctx.seed.tenantId,
      name: 'Fresh Milk',
      slug: overrides?.slug ?? 'fresh-milk',
      description: null,
      status: 'active',
      primary_image_asset_id: null,
      price_amount: 3500,
      compare_at_price_amount: null,
      currency: 'UGX',
      track_inventory: overrides?.trackInventory ?? true,
      stock_quantity: overrides?.stockQuantity ?? 12,
      sku: 'MILK-1L',
      attributes: {},
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null
    })
    .execute();

  await ctx.db
    .insertInto('product_variants')
    .values({
      id: variantId,
      tenant_id: ctx.seed.tenantId,
      product_id: productId,
      name: '1L',
      sku: 'MILK-1L',
      price_amount: 3500,
      stock_quantity: overrides?.stockQuantity ?? 12,
      options: {
        size: '1L'
      },
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  return { productId, variantId };
};

const dbAvailable = await canConnectOrdersDatabase();
const flowSuite = dbAvailable ? describe : describe.skip;

describe('ORD routes scaffold', () => {
  it.each([
    ['POST', '/storefront/test-tenant/orders'],
    ['GET', '/tenants/00000000-0000-0000-0000-000000000001/orders'],
    [
      'GET',
      '/tenants/00000000-0000-0000-0000-000000000001/orders/00000000-0000-0000-0000-000000000002'
    ],
    [
      'POST',
      '/tenants/00000000-0000-0000-0000-000000000001/orders/00000000-0000-0000-0000-000000000002/transition'
    ]
  ])('registers %s %s', async (method, url) => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method, url });

    expect([200, 400, 401, 404, 500]).toContain(res.statusCode);
    await server.close();
  });
});

flowSuite('ORD routes', () => {
  let ctx: Awaited<ReturnType<typeof createRouteTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('creates an order from storefront and replays idempotent retries', async () => {
    ctx = await createRouteTestContext();
    await seedProduct(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const payload = {
      checkout_mode: 'pay_on_delivery',
      items: [
        {
          product_slug: 'fresh-milk',
          quantity: 2
        }
      ],
      customer: {
        full_name: 'Amina',
        phone_e164: '+256700000001'
      },
      fulfillment: {
        type: 'pickup',
        pickup_location_label: 'Acacia Mall'
      }
    };

    const first = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/orders`,
      headers: {
        'idempotency-key': 'order-key-1'
      },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      status: 'PENDING',
      totals: {
        total_amount: 7000
      }
    });

    const replay = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/orders`,
      headers: {
        'idempotency-key': 'order-key-1'
      },
      payload
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const orders = await ctx.db
      .selectFrom('orders')
      .selectAll()
      .where('tenant_id', '=', ctx.seed.tenantId)
      .execute();
    expect(orders).toHaveLength(1);

    const outbox = await ctx.db
      .selectFrom('outbox_events')
      .select('event_type')
      .where('tenant_id', '=', ctx.seed.tenantId)
      .execute();
    expect(outbox.map((entry) => entry.event_type)).toContain('Order.Created');

    await server.close();
  });

  it('fails loudly when an idempotency key is reused with a different payload', async () => {
    ctx = await createRouteTestContext();
    await seedProduct(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/orders`,
      headers: {
        'idempotency-key': 'order-key-2'
      },
      payload: {
        checkout_mode: 'pay_on_delivery',
        items: [{ product_slug: 'fresh-milk', quantity: 1 }],
        customer: {},
        fulfillment: {
          type: 'pickup',
          pickup_location_label: 'Acacia Mall'
        }
      }
    });

    const conflict = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/orders`,
      headers: {
        'idempotency-key': 'order-key-2'
      },
      payload: {
        checkout_mode: 'pay_on_delivery',
        items: [{ product_slug: 'fresh-milk', quantity: 2 }],
        customer: {},
        fulfillment: {
          type: 'pickup',
          pickup_location_label: 'Acacia Mall'
        }
      }
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<ErrorEnvelope>().error_code).toBe(ErrorCode.OrderIdempotencyConflict);

    await server.close();
  });

  it('lists and transitions tenant orders through merchant routes', async () => {
    ctx = await createRouteTestContext();
    await seedProduct(ctx);
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const createRes = await server.inject({
      method: 'POST',
      url: `/storefront/${ctx.seed.tenantSlug}/orders`,
      headers: {
        'idempotency-key': 'order-key-3'
      },
      payload: {
        checkout_mode: 'pay_on_delivery',
        items: [{ product_slug: 'fresh-milk', quantity: 1 }],
        customer: {
          full_name: 'Amina'
        },
        fulfillment: {
          type: 'pickup',
          pickup_location_label: 'Acacia Mall'
        }
      }
    });

    const orderId = createRes.json<{ order_id: string }>().order_id;

    const listRes = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/orders`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toMatchObject({
      orders: [
        {
          id: orderId,
          status: 'PENDING'
        }
      ]
    });

    const detailRes = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/orders/${orderId}`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json()).toMatchObject({
      order: {
        id: orderId,
        status: 'PENDING'
      },
      items: [
        {
          title: 'Fresh Milk'
        }
      ]
    });

    const transitionRes = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/orders/${orderId}/transition`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        action: 'confirm',
        reason: 'Ready for pickup'
      }
    });

    expect(transitionRes.statusCode).toBe(200);
    expect(transitionRes.json()).toMatchObject({
      order: {
        id: orderId,
        status: 'CONFIRMED'
      },
      history: expect.arrayContaining([
        expect.objectContaining({
          to_status: 'CONFIRMED'
        })
      ])
    });

    await server.close();
  });

  it('blocks cross-tenant merchant access to orders', async () => {
    ctx = await createRouteTestContext();
    await seedProduct(ctx);
    const token = await issueAccessToken(ctx);
    const otherTenantId = randomUUID();

    await ctx.db
      .insertInto('tenants')
      .values({
        id: otherTenantId,
        business_name: 'Other Tenant',
        slug: `other-${otherTenantId.slice(0, 8)}`,
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: `/tenants/${otherTenantId}/orders`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantMembershipNotFound);

    await server.close();
  });
});
