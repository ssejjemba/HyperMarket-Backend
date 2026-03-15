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
  throw new Error('DATABASE_URL is required for publishing integration tests');
}

const run = async (): Promise<void> => {
  const db = createDbClient(databaseUrl);
  const stamp = Date.now().toString();
  const suffix = stamp.slice(-12).padStart(12, '0');
  const tenantId = `10000000-0000-0000-0000-${suffix}`;
  const userId = `20000000-0000-0000-0000-${suffix}`;
  const firstConfigId = `30000000-0000-0000-0000-${suffix}`;
  const secondConfigId = `40000000-0000-0000-0000-${suffix}`;

  await db
    .insertInto('users')
    .values({
      id: userId,
      phone_e164: `+2567${stamp.slice(-8).padStart(8, '0')}`,
      email: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      slug: `publishing-${stamp}`,
      business_name: 'Publishing Test Tenant',
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('store_configs')
    .values({
      id: firstConfigId,
      tenant_id: tenantId,
      status: 'draft',
      template_id: 'basic-commerce',
      template_version: 'v1',
      config_version: 1,
      config_payload: {
        brand_name: 'Publishing Test Tenant'
      },
      validation_report: null,
      created_by_user_id: userId,
      created_at: new Date()
    })
    .execute();

  const storedConfig = await db
    .selectFrom('store_configs')
    .select(['id', 'tenant_id', 'config_version', 'status'])
    .where('id', '=', firstConfigId)
    .executeTakeFirst();

  assert.ok(storedConfig);
  assert.equal(storedConfig.tenant_id, tenantId);
  assert.equal(storedConfig.config_version, 1);
  assert.equal(storedConfig.status, 'draft');

  let duplicateVersionError: unknown;
  try {
    await db
      .insertInto('store_configs')
      .values({
        id: secondConfigId,
        tenant_id: tenantId,
        status: 'draft',
        template_id: 'basic-commerce',
        template_version: 'v1',
        config_version: 1,
        config_payload: {
          brand_name: 'Duplicate Version'
        },
        validation_report: null,
        created_by_user_id: userId,
        created_at: new Date()
      })
      .execute();
  } catch (error) {
    duplicateVersionError = error;
  }

  assert.ok(duplicateVersionError instanceof Error);
  assert.match(duplicateVersionError.message, /store_configs_tenant_version_unique/);

  await db
    .insertInto('store_configs')
    .values({
      id: secondConfigId,
      tenant_id: tenantId,
      status: 'active',
      template_id: 'basic-commerce',
      template_version: 'v1',
      config_version: 2,
      config_payload: {
        brand_name: 'Active Config'
      },
      validation_report: null,
      created_by_user_id: userId,
      created_at: new Date()
    })
    .execute();

  let duplicateActiveError: unknown;
  try {
    await db
      .insertInto('store_configs')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: tenantId,
        status: 'active',
        template_id: 'basic-commerce',
        template_version: 'v1',
        config_version: 3,
        config_payload: {
          brand_name: 'Another Active Config'
        },
        validation_report: null,
        created_by_user_id: userId,
        created_at: new Date()
      })
      .execute();
  } catch (error) {
    duplicateActiveError = error;
  }

  assert.ok(duplicateActiveError instanceof Error);
  assert.match(duplicateActiveError.message, /store_configs_tenant_active_idx/);

  await db
    .insertInto('publish_history')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: tenantId,
      action: 'publish',
      from_config_id: firstConfigId,
      to_config_id: secondConfigId,
      actor_user_id: userId,
      result: 'success',
      failure_reason: null,
      created_at: new Date()
    })
    .execute();

  const publishHistoryRow = await db
    .selectFrom('publish_history')
    .select(['tenant_id', 'action', 'from_config_id', 'to_config_id', 'result'])
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  assert.ok(publishHistoryRow);
  assert.equal(publishHistoryRow.action, 'publish');
  assert.equal(publishHistoryRow.from_config_id, firstConfigId);
  assert.equal(publishHistoryRow.to_config_id, secondConfigId);
  assert.equal(publishHistoryRow.result, 'success');

  await db.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
