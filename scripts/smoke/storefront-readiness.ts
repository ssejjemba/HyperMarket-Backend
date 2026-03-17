import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';

import { createDbClient } from '../../packages/core/src/db';
import { buildServer } from '../../apps/api/src/server';
import { loadEnv, type AppConfig } from '../../packages/core/src/config/loadEnv';
import {
  UserIdentity,
  createSessionRepoPg,
  createSessionService,
  createTokenSigner
} from '../../packages/modules/src/iaa';

const applySmokeDefaults = (): void => {
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??= 'postgres://hypermarket:hypermarket@localhost:5432/hypermarket';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.JWT_SECRET ??= 'test-jwt-secret-minimum-32-characters';
  process.env.JWT_ISSUER ??= 'test-suite';
  process.env.TWILIO_ACCOUNT_SID ??= 'ACtestaccountsid000000000000000000';
  process.env.TWILIO_AUTH_TOKEN ??= 'test-twilio-auth-token';
  process.env.TWILIO_VERIFY_SERVICE_SID ??= 'VAtestservicesid000000000000000000';
  process.env.PLATFORM_ROOT_DOMAIN ??= 'platform.ug';
  process.env.MEDIA_CDN_BASE_URL ??= 'http://localhost:3002/cdn';
  process.env.MEDIA_UPLOAD_BASE_URL ??= 'http://localhost:3002/uploads';
  process.env.PAYMENT_DEFAULT_PROVIDER ??= 'flutterwave';
  process.env.FLW_SECRET_KEY ??= 'FLWSECK_TEST_PLACEHOLDER';
  process.env.FLW_WEBHOOK_SECRET_HASH ??= 'test-flw-webhook-hash';
  process.env.NOT_DEFAULT_PROVIDER ??= 'twilio_sms';
  process.env.NOT_DEFAULT_CHANNEL ??= 'sms';
  process.env.TWILIO_SMS_FROM ??= '+256700000000';
  process.env.PUBLIC_ORDER_RATE_LIMIT_WINDOW_SECONDS ??= '60';
  process.env.PUBLIC_ORDER_RATE_LIMIT_MAX ??= '20';
  process.env.PUBLIC_PAYMENT_RATE_LIMIT_WINDOW_SECONDS ??= '60';
  process.env.PUBLIC_PAYMENT_RATE_LIMIT_MAX ??= '10';
};

const createSmokeConfig = (): AppConfig => {
  applySmokeDefaults();
  return {
    ...loadEnv(),
    logLevel: 'silent',
    port: 0
  };
};

const assertResponse = async (
  response: Response,
  expectation: {
    label: string;
    expectedStatus?: number;
  }
): Promise<unknown> => {
  const bodyText = await response.text();
  const body = bodyText.length > 0 ? JSON.parse(bodyText) : null;
  const expectedStatus = expectation.expectedStatus ?? 200;

  if (response.status !== expectedStatus) {
    throw new Error(
      `${expectation.label} failed with ${response.status}: ${JSON.stringify(body, null, 2)}`
    );
  }

  return body;
};

const seedStorefrontData = async (
  db: ReturnType<typeof createDbClient>
): Promise<{
  tenantId: string;
  tenantSlug: string;
  categorySlug: string;
  productSlug: string;
  userId: string;
  userPhone: string;
}> => {
  const suffix = randomUUID().slice(0, 8);
  const tenantId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const userId = randomUUID();
  const tenantSlug = `smoke-tenant-${suffix}`;
  const categorySlug = `smoke-category-${suffix}`;
  const productSlug = `smoke-product-${suffix}`;
  const userPhone = `+25670${Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0')}`;
  const now = new Date();

  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      business_name: 'Smoke Test Tenant',
      slug: tenantSlug,
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: now,
      updated_at: now
    })
    .execute();

  await db
    .insertInto('users')
    .values({
      id: userId,
      phone_e164: userPhone,
      email: 'smoke-owner@example.com',
      is_active: true,
      created_at: now,
      updated_at: now
    })
    .execute();

  await db
    .insertInto('tenant_memberships')
    .values({
      id: randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      role: 'owner',
      status: 'active',
      created_at: now,
      revoked_at: null
    })
    .execute();

  await db
    .insertInto('tenant_settings')
    .values({
      tenant_id: tenantId,
      contact_name: 'Smoke Ops',
      contact_email: null,
      contact_phone_e164: '+256700000000',
      contact_whatsapp_e164: '+256700000000',
      social_links: {},
      business_hours: {},
      created_at: now,
      updated_at: now
    })
    .onConflict((builder) =>
      builder.column('tenant_id').doUpdateSet({
        contact_phone_e164: '+256700000000',
        contact_whatsapp_e164: '+256700000000',
        updated_at: now
      })
    )
    .execute();

  await db
    .insertInto('categories')
    .values({
      id: categoryId,
      tenant_id: tenantId,
      name: 'Smoke Category',
      slug: categorySlug,
      description: 'Category used by the live storefront smoke check.',
      sort_order: 0,
      is_visible: true,
      created_at: now,
      updated_at: now,
      deleted_at: null
    })
    .execute();

  await db
    .insertInto('products')
    .values({
      id: productId,
      tenant_id: tenantId,
      name: 'Smoke Product',
      slug: productSlug,
      description: 'Product used by the live storefront smoke check.',
      status: 'active',
      primary_image_asset_id: null,
      price_amount: 12500,
      compare_at_price_amount: null,
      currency: 'UGX',
      track_inventory: true,
      stock_quantity: 25,
      sku: 'SMOKE-001',
      attributes: {},
      created_at: now,
      updated_at: now,
      deleted_at: null
    })
    .execute();

  await db
    .insertInto('product_categories')
    .values({
      tenant_id: tenantId,
      product_id: productId,
      category_id: categoryId,
      created_at: now
    })
    .execute();

  return {
    tenantId,
    tenantSlug,
    categorySlug,
    productSlug,
    userId,
    userPhone
  };
};

const issueAccessToken = async (
  db: ReturnType<typeof createDbClient>,
  config: AppConfig,
  user: { id: string; phoneE164: string }
): Promise<string> => {
  const sessionRepo = createSessionRepoPg(db);
  const tokenSigner = createTokenSigner({
    secret: config.jwtSecret,
    ttlSeconds: config.sessionTtlSeconds,
    issuer: config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: config.sessionTtlSeconds
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

const main = async (): Promise<void> => {
  const config = createSmokeConfig();
  const db = createDbClient(config.databaseUrl);
  const seeded = await seedStorefrontData(db);
  const server = buildServer({ config, devRoutesMode: 'disabled' });
  let baseUrl = '';
  const redisTarget = new URL(config.redisUrl);
  const notificationsDlq = new Queue('notifications.dispatch.dlq', {
    connection: {
      host: redisTarget.hostname,
      port: Number(redisTarget.port || 6379),
      maxRetriesPerRequest: null
    }
  });

  try {
    const address = await server.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = typeof address === 'string' ? address : `http://127.0.0.1:${config.port}`;

    const live = await assertResponse(await fetch(`${baseUrl}/health/live`), {
      label: 'health live'
    });
    const ready = await assertResponse(await fetch(`${baseUrl}/health/ready`), {
      label: 'health ready'
    });
    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const metricsBody = await metricsResponse.text();
    if (metricsResponse.status !== 200) {
      throw new Error(`api metrics failed with ${metricsResponse.status}: ${metricsBody}`);
    }
    if (!metricsBody.includes('iaa_otp_request_total')) {
      throw new Error('api metrics output is missing iaa_otp_request_total');
    }
    const categories = await assertResponse(
      await fetch(`${baseUrl}/storefront/${seeded.tenantSlug}/categories`),
      { label: 'storefront categories' }
    );
    const category = await assertResponse(
      await fetch(`${baseUrl}/storefront/${seeded.tenantSlug}/categories/${seeded.categorySlug}`),
      { label: 'storefront category detail' }
    );
    const products = await assertResponse(
      await fetch(`${baseUrl}/storefront/${seeded.tenantSlug}/products`),
      { label: 'storefront products' }
    );
    const product = await assertResponse(
      await fetch(`${baseUrl}/storefront/${seeded.tenantSlug}/products/${seeded.productSlug}`),
      { label: 'storefront product detail' }
    );
    const order = await assertResponse(
      await fetch(`${baseUrl}/storefront/${seeded.tenantSlug}/orders`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `smoke-${randomUUID()}`
        },
        body: JSON.stringify({
          checkout_mode: 'pay_on_delivery',
          items: [{ product_slug: seeded.productSlug, quantity: 2 }],
          customer: {
            full_name: 'Smoke Test Customer',
            phone_e164: '+256700000001'
          },
          fulfillment: {
            type: 'pickup',
            pickup_location_label: 'Kampala Main Branch'
          }
        })
      }),
      { label: 'storefront order create' }
    );
    const accessToken = await issueAccessToken(db, config, {
      id: seeded.userId,
      phoneE164: seeded.userPhone
    });
    const createdOrderId =
      typeof (order as { order_id?: unknown }).order_id === 'string'
        ? (order as { order_id: string }).order_id
        : null;

    if (createdOrderId === null) {
      throw new Error('storefront order response did not include order_id');
    }

    await db
      .insertInto('payment_intents')
      .values({
        id: randomUUID(),
        tenant_id: seeded.tenantId,
        order_id: createdOrderId,
        provider: 'flutterwave',
        method: 'mobile_money',
        status: 'AWAITING_CUSTOMER',
        amount: 25000,
        currency: 'UGX',
        tx_ref: `t:${seeded.tenantId}:o:${createdOrderId}:pi:smoke:ts:1`,
        provider_reference: 'smoke-flw-ref',
        provider_transaction_id: 'smoke-flw-tx',
        customer_phone_e164: '+256700000001',
        customer_email: 'customer@example.com',
        network: 'MTN',
        failure_code: null,
        failure_message: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

    const latestOutbox = await db
      .selectFrom('outbox_events')
      .select('id')
      .where('tenant_id', '=', seeded.tenantId)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    const notificationJobId = randomUUID();

    await db
      .insertInto('notification_jobs')
      .values({
        id: notificationJobId,
        tenant_id: seeded.tenantId,
        event_id: latestOutbox.id,
        event_type: 'Order.Created',
        channel: 'sms',
        recipient: '+256700000001',
        template_id: 'customer.order_confirmation',
        template_version: 1,
        payload: {
          order_number: (order as { order_number?: unknown }).order_number ?? 1,
          total_amount: 25000,
          currency: 'UGX',
          store_name: 'Smoke Test Tenant'
        },
        dedupe_key: `smoke-${randomUUID()}`,
        status: 'FAILED_RETRYABLE',
        attempt_count: 1,
        last_error_code: 'not_provider_unavailable',
        last_error_message: 'temporary outage',
        provider: 'twilio_sms',
        provider_message_id: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

    await db
      .insertInto('notification_delivery_attempts')
      .values({
        id: randomUUID(),
        tenant_id: seeded.tenantId,
        job_id: notificationJobId,
        attempt_number: 1,
        provider: 'twilio_sms',
        result: 'failed',
        error_code: 'not_provider_unavailable',
        error_message: 'temporary outage',
        provider_message_id: null,
        created_at: new Date()
      })
      .execute();

    const dlqJob = await notificationsDlq.add('notifications.dispatch.dlq', {
      job_id: notificationJobId,
      tenant_id: seeded.tenantId,
      error_message: 'temporary outage'
    });
    const authHeaders = {
      authorization: `Bearer ${accessToken}`
    };
    const opsSummary = await assertResponse(
      await fetch(`${baseUrl}/tenants/${seeded.tenantId}/ops/summary`, {
        headers: authHeaders
      }),
      { label: 'ops summary' }
    );
    const opsPayments = await assertResponse(
      await fetch(`${baseUrl}/tenants/${seeded.tenantId}/ops/payments?status=AWAITING_CUSTOMER`, {
        headers: authHeaders
      }),
      { label: 'ops payments' }
    );
    const opsNotifications = await assertResponse(
      await fetch(
        `${baseUrl}/tenants/${seeded.tenantId}/ops/notifications?status=FAILED_RETRYABLE`,
        {
          headers: authHeaders
        }
      ),
      { label: 'ops notifications' }
    );
    const opsAttempts = await assertResponse(
      await fetch(
        `${baseUrl}/tenants/${seeded.tenantId}/ops/notifications/${notificationJobId}/attempts`,
        {
          headers: authHeaders
        }
      ),
      { label: 'ops notification attempts' }
    );
    const opsDlq = await assertResponse(
      await fetch(`${baseUrl}/tenants/${seeded.tenantId}/ops/dlq/notifications?limit=10`, {
        headers: authHeaders
      }),
      { label: 'ops notification dlq' }
    );
    const replayTarget = dlqJob.id?.toString();
    if (replayTarget === undefined) {
      throw new Error('failed to create smoke dlq job');
    }
    const opsReplay = await assertResponse(
      await fetch(
        `${baseUrl}/tenants/${seeded.tenantId}/ops/dlq/notifications/${replayTarget}/replay`,
        {
          method: 'POST',
          headers: authHeaders
        }
      ),
      { label: 'ops dlq replay' }
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          tenant_slug: seeded.tenantSlug,
          checks: {
            live,
            ready,
            metrics: {
              status: metricsResponse.status
            }
          },
          seeded,
          categories_count: Array.isArray((categories as { categories?: unknown[] }).categories)
            ? (categories as { categories: unknown[] }).categories.length
            : null,
          category_products_count: Array.isArray((category as { products?: unknown[] }).products)
            ? (category as { products: unknown[] }).products.length
            : null,
          products_count: Array.isArray((products as { products?: unknown[] }).products)
            ? (products as { products: unknown[] }).products.length
            : null,
          product_slug:
            typeof (product as { product?: { slug?: unknown } }).product?.slug === 'string'
              ? (product as { product: { slug: string } }).product.slug
              : null,
          order_status:
            typeof (order as { status?: unknown }).status === 'string'
              ? (order as { status: string }).status
              : null,
          order_number:
            typeof (order as { order_number?: unknown }).order_number === 'number'
              ? (order as { order_number: number }).order_number
              : null,
          ops: {
            summary: opsSummary,
            payments_count: Array.isArray((opsPayments as { intents?: unknown[] }).intents)
              ? (opsPayments as { intents: unknown[] }).intents.length
              : null,
            notifications_count: Array.isArray((opsNotifications as { jobs?: unknown[] }).jobs)
              ? (opsNotifications as { jobs: unknown[] }).jobs.length
              : null,
            attempts_count: Array.isArray((opsAttempts as { attempts?: unknown[] }).attempts)
              ? (opsAttempts as { attempts: unknown[] }).attempts.length
              : null,
            dlq_count: Array.isArray((opsDlq as { jobs?: unknown[] }).jobs)
              ? (opsDlq as { jobs: unknown[] }).jobs.length
              : null,
            replay: opsReplay
          }
        },
        null,
        2
      )
    );
  } finally {
    await notificationsDlq.close();
    await server.close();
    await db.deleteFrom('tenants').where('id', '=', seeded.tenantId).execute();
    await db.destroy();
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
