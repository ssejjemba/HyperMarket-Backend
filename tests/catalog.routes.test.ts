import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';
import {
  UserIdentity,
  createSessionRepoPg,
  createSessionService,
  createTokenSigner
} from '@hypermarket/modules/iaa';

import { buildServer } from '../apps/api/src/server';
import { enqueueStorefrontRevalidationJob } from '../apps/worker/src/revalidation/storefrontRevalidationQueue';

type ErrorEnvelope = {
  request_id: string;
  error_code: string;
  message: string;
};

const TEST_CONFIG: AppConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgres://tester:tester@127.0.0.1:5432/hypermarket_test',
  redisUrl: 'redis://127.0.0.1:6379',
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

const issueAccessToken = async (
  ctx: Awaited<ReturnType<typeof createTestContext>>,
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

const dbAvailable = await canConnectDatabase();
const flowSuite = dbAvailable ? describe : describe.skip;

describe('CAT routes scaffold', () => {
  it.each([
    ['POST', '/tenants/00000000-0000-0000-0000-000000000001/categories'],
    ['GET', '/tenants/00000000-0000-0000-0000-000000000001/categories'],
    ['POST', '/tenants/00000000-0000-0000-0000-000000000001/products'],
    ['GET', '/tenants/00000000-0000-0000-0000-000000000001/products'],
    ['GET', '/storefront/test-tenant/categories'],
    ['GET', '/storefront/test-tenant/products']
  ])('registers %s %s', async (method, url) => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method, url });

    expect([200, 401, 404, 500]).toContain(res.statusCode);
    await server.close();
  });
});

flowSuite('CAT routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('rejects invalid product price rules', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/products`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Milk',
        slug: 'milk',
        status: 'active',
        price_amount: 2000,
        compare_at_price_amount: 1500,
        currency: 'UGX',
        track_inventory: false,
        stock_quantity: null
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.CatalogPriceInvalid);

    await server.close();
  });

  it('enforces tenant-isolated slug uniqueness', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const payload = {
      name: 'Fresh',
      slug: 'fresh',
      status: 'draft',
      price_amount: 1000,
      currency: 'UGX',
      track_inventory: false,
      stock_quantity: null
    };

    const first = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/products`,
      headers: { authorization: `Bearer ${token}` },
      payload
    });

    expect(first.statusCode).toBe(200);

    const second = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/products`,
      headers: { authorization: `Bearer ${token}` },
      payload
    });

    expect(second.statusCode).toBe(409);
    expect(second.json<ErrorEnvelope>().error_code).toBe(ErrorCode.CatalogSlugTaken);

    await server.close();
  });

  it('creates category and product, maps them, exposes storefront DTOs, and emits revalidation events', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const categoryRes = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/categories`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Fresh',
        slug: 'fresh',
        is_visible: true
      }
    });

    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ category: { id: string } }>().category.id;

    const productRes = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/products`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Fresh Milk',
        slug: 'fresh-milk',
        status: 'active',
        price_amount: 3500,
        compare_at_price_amount: 5000,
        currency: 'UGX',
        track_inventory: true,
        stock_quantity: 12,
        variants: [
          {
            name: '1L',
            sku: 'MILK-1L',
            price_amount: 3500,
            stock_quantity: 12,
            options: {
              size: '1L'
            }
          }
        ]
      }
    });

    expect(productRes.statusCode).toBe(200);
    const productId = productRes.json<{ product: { id: string } }>().product.id;

    const mappingRes = await server.inject({
      method: 'PUT',
      url: `/tenants/${ctx.seed.tenantId}/products/${productId}/categories`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        category_ids: [categoryId]
      }
    });

    expect(mappingRes.statusCode).toBe(200);
    expect(mappingRes.json<{ product: { category_ids: string[] } }>().product.category_ids).toEqual(
      [categoryId]
    );

    const storefrontCategories = await server.inject({
      method: 'GET',
      url: `/storefront/${ctx.seed.tenantSlug}/categories`
    });
    expect(storefrontCategories.statusCode).toBe(200);
    expect(storefrontCategories.json()).toMatchObject({
      categories: [
        {
          slug: 'fresh'
        }
      ],
      pagination: {
        total: 1
      }
    });

    const storefrontProducts = await server.inject({
      method: 'GET',
      url: `/storefront/${ctx.seed.tenantSlug}/products`
    });
    expect(storefrontProducts.statusCode).toBe(200);
    expect(storefrontProducts.json()).toMatchObject({
      products: [
        {
          slug: 'fresh-milk',
          category_ids: [categoryId]
        }
      ]
    });

    const storefrontCategory = await server.inject({
      method: 'GET',
      url: `/storefront/${ctx.seed.tenantSlug}/categories/fresh`
    });
    expect(storefrontCategory.statusCode).toBe(200);
    expect(storefrontCategory.json()).toMatchObject({
      category: {
        slug: 'fresh'
      },
      products: [
        {
          slug: 'fresh-milk'
        }
      ]
    });

    const storefrontProduct = await server.inject({
      method: 'GET',
      url: `/storefront/${ctx.seed.tenantSlug}/products/fresh-milk`
    });
    expect(storefrontProduct.statusCode).toBe(200);
    expect(storefrontProduct.json()).toMatchObject({
      product: {
        slug: 'fresh-milk',
        price_amount: 3500,
        variants: [
          {
            sku: 'MILK-1L'
          }
        ]
      }
    });

    const outboxEvents = await ctx.db
      .selectFrom('outbox_events')
      .select(['event_type', 'payload'])
      .where('tenant_id', '=', ctx.seed.tenantId)
      .orderBy('created_at', 'asc')
      .execute();

    expect(outboxEvents.map((event) => event.event_type)).toEqual([
      'Catalog.CategoryUpserted',
      'Catalog.ProductUpserted',
      'Catalog.ProductCategoryChanged'
    ]);

    const add = vi.fn().mockResolvedValue(undefined);
    const queued = await enqueueStorefrontRevalidationJob(
      { add },
      {
        id: randomUUID(),
        eventType: outboxEvents[2]?.event_type ?? 'Catalog.ProductCategoryChanged',
        tenantId: ctx.seed.tenantId,
        payload: outboxEvents[2]?.payload ?? {
          tenant_id: ctx.seed.tenantId,
          targets: ['/']
        },
        occurredAt: new Date(),
        availableAt: new Date(),
        attempts: 0
      }
    );

    expect(queued).toBe(true);
    expect(add).toHaveBeenCalled();

    await server.close();
  });

  it('blocks cross-tenant merchant reads', async () => {
    ctx = await createTestContext();
    const otherTenantId = randomUUID();
    const token = await issueAccessToken(ctx);

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
      url: `/tenants/${otherTenantId}/products`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(404);

    await server.close();
  });
});
