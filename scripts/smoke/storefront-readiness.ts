import { randomUUID } from 'node:crypto';

import { createDbClient } from '../../packages/core/src/db';
import { buildServer } from '../../apps/api/src/server';
import { loadEnv, type AppConfig } from '../../packages/core/src/config/loadEnv';

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
}> => {
  const suffix = randomUUID().slice(0, 8);
  const tenantId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const tenantSlug = `smoke-tenant-${suffix}`;
  const categorySlug = `smoke-category-${suffix}`;
  const productSlug = `smoke-product-${suffix}`;
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
    productSlug
  };
};

const main = async (): Promise<void> => {
  const config = createSmokeConfig();
  const db = createDbClient(config.databaseUrl);
  const seeded = await seedStorefrontData(db);
  const server = buildServer({ config, devRoutesMode: 'disabled' });
  let baseUrl = '';

  try {
    const address = await server.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = typeof address === 'string' ? address : `http://127.0.0.1:${config.port}`;

    const live = await assertResponse(await fetch(`${baseUrl}/health/live`), {
      label: 'health live'
    });
    const ready = await assertResponse(await fetch(`${baseUrl}/health/ready`), {
      label: 'health ready'
    });
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

    console.log(
      JSON.stringify(
        {
          ok: true,
          base_url: baseUrl,
          tenant_slug: seeded.tenantSlug,
          checks: {
            live,
            ready
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
              : null
        },
        null,
        2
      )
    );
  } finally {
    await server.close();
    await db.deleteFrom('tenants').where('id', '=', seeded.tenantId).execute();
    await db.destroy();
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
