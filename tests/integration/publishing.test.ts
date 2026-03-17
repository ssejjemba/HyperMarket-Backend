import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { createDbClient, sql } from '../../packages/core/src/db/index';
import {
  PublishingError,
  createConfigValidator,
  createPublishConfigUseCase,
  createRevalidationPlanner,
  createRollbackConfigUseCase,
  createStoreConfigRepoPg
} from '../../packages/modules/src/publishing';
import { buildNotificationPlan } from '../../packages/modules/src/notifications';
import { createTemplateRegistry } from '../../packages/modules/src/templates';
import { ErrorCode } from '../../packages/contracts/src/errors/errorCodes';

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
  const storeConfigRepo = createStoreConfigRepoPg(db);
  const configValidator = createConfigValidator(createTemplateRegistry());
  const publishConfigUseCase = createPublishConfigUseCase({
    db,
    configValidator,
    revalidationPlanner: createRevalidationPlanner()
  });
  const rollbackConfigUseCase = createRollbackConfigUseCase({
    db,
    configValidator,
    revalidationPlanner: createRevalidationPlanner()
  });
  const stamp = Date.now().toString();
  const suffix = stamp.slice(-12).padStart(12, '0');
  const tenantId = `10000000-0000-0000-0000-${suffix}`;
  const userId = `20000000-0000-0000-0000-${suffix}`;
  const firstConfigId = `30000000-0000-0000-0000-${suffix}`;
  const secondConfigId = `40000000-0000-0000-0000-${suffix}`;
  const otherTenantId = `50000000-0000-0000-0000-${suffix}`;

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
    .insertInto('tenants')
    .values({
      id: otherTenantId,
      slug: `publishing-other-${stamp}`,
      business_name: 'Other Publishing Test Tenant',
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('tenant_settings')
    .values({
      tenant_id: otherTenantId,
      contact_name: 'Publishing Owner',
      contact_email: 'owner@example.com',
      contact_phone_e164: '+256700000020',
      contact_whatsapp_e164: '+256700000021',
      social_links: {},
      business_hours: {},
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

  const draftOne = await storeConfigRepo.createDraftConfig({
    tenantId: otherTenantId,
    templateId: 'basic-commerce',
    templateVersion: 'v1',
    configPayload: {
      brand_name: 'Draft One',
      hero_title: 'Fresh products for Kampala',
      hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
      primary_color: '#0B6E4F',
      cta_label: 'Shop now'
    },
    validationReport: {
      isValid: true,
      errors: []
    },
    createdByUserId: userId
  });

  const draftTwo = await storeConfigRepo.createDraftConfig({
    tenantId: otherTenantId,
    templateId: 'basic-commerce',
    templateVersion: 'v1',
    configPayload: {
      brand_name: 'Draft Two',
      hero_title: 'Fresh products for Kampala',
      hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
      primary_color: '#0B6E4F',
      cta_label: 'Shop now'
    },
    validationReport: {
      isValid: true,
      errors: []
    },
    createdByUserId: userId
  });

  assert.equal(draftOne.configVersion, 1);
  assert.equal(draftTwo.configVersion, 2);

  const listedConfigs = await storeConfigRepo.listConfigs(otherTenantId);
  assert.deepEqual(
    listedConfigs.map((config) => config.configVersion),
    [2, 1]
  );

  const scopedRead = await storeConfigRepo.getConfigById(tenantId, draftOne.id);
  assert.equal(scopedRead, null);

  const updatedDraft = await storeConfigRepo.updateDraftConfig({
    tenantId: otherTenantId,
    configId: draftOne.id,
    configPayload: {
      brand_name: 'Draft One Updated'
    },
    validationReport: {
      isValid: true,
      errors: []
    }
  });
  assert.equal(updatedDraft.configPayload.brand_name, 'Draft One Updated');

  await db
    .updateTable('store_configs')
    .set({ status: 'active' })
    .where('id', '=', draftTwo.id)
    .execute();
  await db
    .updateTable('tenants')
    .set({ active_config_id: draftTwo.id })
    .where('id', '=', otherTenantId)
    .execute();

  let nonDraftUpdateError: unknown;
  try {
    await storeConfigRepo.updateDraftConfig({
      tenantId: otherTenantId,
      configId: draftTwo.id,
      configPayload: {
        brand_name: 'Should Fail'
      }
    });
  } catch (error) {
    nonDraftUpdateError = error;
  }

  assert.ok(nonDraftUpdateError instanceof PublishingError);
  assert.equal(nonDraftUpdateError.code, ErrorCode.ConfigNotDraft);

  const publishDraft = await storeConfigRepo.createDraftConfig({
    tenantId: otherTenantId,
    templateId: 'basic-commerce',
    templateVersion: 'v1',
    configPayload: {
      brand_name: 'Publish Draft',
      hero_title: 'Fresh products for Kampala',
      hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
      primary_color: '#0B6E4F',
      cta_label: 'Shop now'
    },
    validationReport: {
      isValid: true,
      errors: []
    },
    createdByUserId: userId
  });

  const publishResult = await publishConfigUseCase.execute({
    tenantId: otherTenantId,
    configId: publishDraft.id,
    actorUserId: userId,
    requestId: `publish-${stamp}`
  });

  assert.equal(publishResult.activeConfigId, publishDraft.id);

  const publishedTenant = await db
    .selectFrom('tenants')
    .select('active_config_id')
    .where('id', '=', otherTenantId)
    .executeTakeFirst();
  assert.equal(publishedTenant?.active_config_id, publishDraft.id);

  const publishedHistory = await db
    .selectFrom('publish_history')
    .select(['action', 'from_config_id', 'to_config_id', 'result'])
    .where('tenant_id', '=', otherTenantId)
    .where('to_config_id', '=', publishDraft.id)
    .executeTakeFirst();
  assert.deepEqual(publishedHistory, {
    action: 'publish',
    from_config_id: draftTwo.id,
    to_config_id: publishDraft.id,
    result: 'success'
  });

  const outboxEvent = await db
    .selectFrom('outbox_events')
    .select([
      'id',
      'event_type',
      'tenant_id',
      'actor_user_id',
      'payload',
      'occurred_at',
      'available_at',
      'attempts',
      'last_error',
      'created_at'
    ])
    .where('tenant_id', '=', otherTenantId)
    .where('event_type', '=', 'Publish.Completed')
    .executeTakeFirst();
  assert.ok(outboxEvent);
  assert.equal(outboxEvent.event_type, 'Publish.Completed');
  assert.equal(outboxEvent.tenant_id, otherTenantId);
  assert.equal(outboxEvent.actor_user_id, userId);
  assert.deepEqual(outboxEvent.payload, {
    tenant_id: otherTenantId,
    config_id: publishDraft.id,
    previous_config_id: draftTwo.id,
    targets: ['/', '/sitemap.xml', '/robots.txt'],
    store_name: 'Other Publishing Test Tenant',
    merchant_phone_e164: '+256700000021'
  });

  const publishPlan = buildNotificationPlan({
    id: outboxEvent.id,
    eventType: outboxEvent.event_type,
    tenantId: outboxEvent.tenant_id,
    correlationId: null,
    actorUserId: outboxEvent.actor_user_id,
    payload: outboxEvent.payload,
    occurredAt: outboxEvent.occurred_at,
    availableAt: outboxEvent.available_at,
    dispatchedAt: null,
    attempts: outboxEvent.attempts,
    lastError: outboxEvent.last_error,
    createdAt: outboxEvent.created_at
  });
  assert.equal(publishPlan.length, 1);
  assert.equal(publishPlan[0]?.templateId, 'publish.completed.merchant');
  assert.equal(publishPlan[0]?.recipient, '+256700000021');

  const invalidPublishConfigId = `60000000-0000-0000-0000-${suffix}`;
  await db
    .insertInto('store_configs')
    .values({
      id: invalidPublishConfigId,
      tenant_id: otherTenantId,
      status: 'draft',
      template_id: 'basic-commerce',
      template_version: 'v1',
      config_version: 4,
      config_payload: {
        hero_title: 'Fresh products for Kampala'
      },
      validation_report: null,
      created_by_user_id: userId,
      created_at: new Date()
    })
    .execute();

  let invalidPublishError: unknown;
  try {
    await publishConfigUseCase.execute({
      tenantId: otherTenantId,
      configId: invalidPublishConfigId,
      actorUserId: userId
    });
  } catch (error) {
    invalidPublishError = error;
  }

  assert.ok(invalidPublishError instanceof PublishingError);
  assert.equal(invalidPublishError.code, ErrorCode.PublishValidationFailed);

  const rollbackResult = await rollbackConfigUseCase.execute({
    tenantId: otherTenantId,
    configId: draftTwo.id,
    actorUserId: userId,
    requestId: `rollback-${stamp}`
  });

  assert.equal(rollbackResult.activeConfigId, draftTwo.id);
  assert.equal(rollbackResult.previousConfigId, publishDraft.id);

  const rolledBackTenant = await db
    .selectFrom('tenants')
    .select('active_config_id')
    .where('id', '=', otherTenantId)
    .executeTakeFirst();
  assert.equal(rolledBackTenant?.active_config_id, draftTwo.id);

  const rollbackHistory = await db
    .selectFrom('publish_history')
    .select(['action', 'from_config_id', 'to_config_id', 'result'])
    .where('tenant_id', '=', otherTenantId)
    .where('action', '=', 'rollback')
    .where('to_config_id', '=', draftTwo.id)
    .executeTakeFirst();
  assert.deepEqual(rollbackHistory, {
    action: 'rollback',
    from_config_id: publishDraft.id,
    to_config_id: draftTwo.id,
    result: 'success'
  });

  const rollbackOutboxEvent = await db
    .selectFrom('outbox_events')
    .select([
      'id',
      'event_type',
      'tenant_id',
      'actor_user_id',
      'payload',
      'occurred_at',
      'available_at',
      'attempts',
      'last_error',
      'created_at'
    ])
    .where('tenant_id', '=', otherTenantId)
    .where('event_type', '=', 'Rollback.Completed')
    .executeTakeFirst();
  assert.ok(rollbackOutboxEvent);
  assert.equal(rollbackOutboxEvent.event_type, 'Rollback.Completed');
  assert.equal(rollbackOutboxEvent.tenant_id, otherTenantId);
  assert.equal(rollbackOutboxEvent.actor_user_id, userId);
  assert.deepEqual(rollbackOutboxEvent.payload, {
    tenant_id: otherTenantId,
    config_id: draftTwo.id,
    previous_config_id: publishDraft.id,
    targets: ['/', '/sitemap.xml', '/robots.txt'],
    store_name: 'Other Publishing Test Tenant',
    merchant_phone_e164: '+256700000021'
  });

  let invalidRollbackError: unknown;
  try {
    await rollbackConfigUseCase.execute({
      tenantId: otherTenantId,
      configId: invalidPublishConfigId,
      actorUserId: userId
    });
  } catch (error) {
    invalidRollbackError = error;
  }

  assert.ok(invalidRollbackError instanceof PublishingError);
  assert.equal(invalidRollbackError.code, ErrorCode.RollbackFailed);

  await db.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
