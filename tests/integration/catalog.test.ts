import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { createDbClient, sql } from '../../packages/core/src/db/index';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '../..');

loadDotenv({ path: path.join(rootDir, '.env.example') });
loadDotenv({ path: path.join(rootDir, '.env'), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for catalog integration tests');
}

const run = async (): Promise<void> => {
  const db = createDbClient(databaseUrl);
  const suffix = Date.now().toString().slice(-12).padStart(12, '0');
  const tenantA = `10000000-0000-0000-0000-${suffix}`;
  const tenantB = `20000000-0000-0000-0000-${suffix}`;

  await db
    .insertInto('tenants')
    .values([
      {
        id: tenantA,
        slug: `cat-a-${suffix}`,
        business_name: 'Catalog A',
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: tenantB,
        slug: `cat-b-${suffix}`,
        business_name: 'Catalog B',
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    ])
    .execute();

  const categoryA = await db
    .insertInto('categories')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: tenantA,
      name: 'Fresh',
      slug: 'fresh',
      description: null,
      sort_order: 0,
      is_visible: true,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null
    })
    .returning(['id', 'tenant_id'])
    .executeTakeFirstOrThrow();

  await db
    .insertInto('categories')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: tenantB,
      name: 'Fresh',
      slug: 'fresh',
      description: null,
      sort_order: 0,
      is_visible: true,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null
    })
    .execute();

  let duplicateError: unknown;
  try {
    await db
      .insertInto('categories')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: tenantA,
        name: 'Fresh Duplicate',
        slug: 'fresh',
        description: null,
        sort_order: 0,
        is_visible: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      })
      .execute();
  } catch (error) {
    duplicateError = error;
  }

  assert.ok(duplicateError instanceof Error);
  assert.match(duplicateError.message, /categories_tenant_slug_unique/);

  const productA = await db
    .insertInto('products')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: tenantA,
      name: 'Milk',
      slug: 'milk',
      description: null,
      status: 'active',
      primary_image_asset_id: null,
      price_amount: 3500,
      compare_at_price_amount: null,
      currency: 'UGX',
      track_inventory: false,
      stock_quantity: null,
      sku: 'MILK-1',
      attributes: {},
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null
    })
    .returning(['id', 'tenant_id'])
    .executeTakeFirstOrThrow();

  await db
    .insertInto('product_categories')
    .values({
      tenant_id: tenantA,
      product_id: productA.id,
      category_id: categoryA.id,
      created_at: new Date()
    })
    .execute();

  const mappingCount = await db
    .selectFrom('product_categories')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('tenant_id', '=', tenantA)
    .where('product_id', '=', productA.id)
    .where('category_id', '=', categoryA.id)
    .executeTakeFirstOrThrow();

  assert.equal(Number((mappingCount as { count: number | string }).count), 1);

  const crossTenantProduct = await db
    .selectFrom('products')
    .select(['id'])
    .where('tenant_id', '=', tenantB)
    .where('slug', '=', 'milk')
    .executeTakeFirst();

  assert.equal(crossTenantProduct, undefined);

  await db.destroy();
};

await run();
