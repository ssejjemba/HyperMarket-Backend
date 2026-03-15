import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { loadEnv } from '../../packages/core/src/config/loadEnv';
import { createDbClient } from '../../packages/core/src/db/index';
import {
  createCreateTenantUseCase,
  createTenantDomainRepoPg,
  createTenantMembershipRepoPg,
  createTenantRepoPg,
  createTenantSettingsRepoPg,
  TenancyError
} from '../../packages/modules/src/tenancy/index';
import { ErrorCode } from '../../packages/contracts/src/errors/errorCodes';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '../..');

loadDotenv({ path: path.join(rootDir, '.env.example') });
loadDotenv({ path: path.join(rootDir, '.env'), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for tenancy integration tests');
}

const run = async (): Promise<void> => {
  const config = loadEnv();
  const db = createDbClient(databaseUrl);
  const tenantRepo = createTenantRepoPg(db);
  const domainRepo = createTenantDomainRepoPg(db, {
    platformRootDomain: config.platformRootDomain
  });
  const membershipRepo = createTenantMembershipRepoPg(db);
  const settingsRepo = createTenantSettingsRepoPg(db);
  const createTenantUseCase = createCreateTenantUseCase({
    db,
    platformRootDomain: config.platformRootDomain
  });

  const stamp = Date.now();
  const slug = `test-tenant-${stamp}`;
  const domain = `${slug}.${config.platformRootDomain}`;
  const ownerUserId = '00000000-0000-0000-0000-000000000001';
  const createResult = await createTenantUseCase.execute({
    businessName: 'Test Tenant',
    slug,
    ownerUserId,
    requestId: `tenant-create-${stamp}`
  });
  const tenant = await tenantRepo.findById(createResult.tenantId);
  assert.ok(tenant);
  assert.equal(createResult.slug, slug);
  assert.equal(createResult.primaryDomain, domain);

  const resolvedTenantId = await domainRepo.findTenantIdByDomain(domain);
  assert.equal(resolvedTenantId, createResult.tenantId);

  const list = await tenantRepo.listForUser(ownerUserId);
  assert.ok(list.some((item) => item.id === createResult.tenantId));

  const memberships = await membershipRepo.listMemberships(ownerUserId);
  assert.ok(
    memberships.some(
      (item) => item.tenantId === createResult.tenantId && item.userId === ownerUserId
    )
  );

  const listedDomains = await domainRepo.listDomains(createResult.tenantId);
  assert.ok(listedDomains.some((item) => item.domain === domain));

  const storedSettings = await settingsRepo.getSettings(createResult.tenantId);
  assert.equal(storedSettings.tenantId, createResult.tenantId);
  assert.deepEqual(storedSettings.socialLinks, {});

  const auditRows = await db
    .selectFrom('audit_events')
    .select(['action', 'target_id'])
    .where('action', '=', 'tenant.created')
    .where('target_id', '=', createResult.tenantId)
    .execute();
  assert.equal(auditRows.length, 1);

  const otherList = await tenantRepo.listForUser('00000000-0000-0000-0000-000000000002');
  assert.ok(otherList.every((item) => item.id !== createResult.tenantId));

  const beforeCounts = {
    tenants: await db.selectFrom('tenants').select('id').execute(),
    domains: await db.selectFrom('tenant_domains').select('id').execute(),
    memberships: await db.selectFrom('tenant_memberships').select('id').execute(),
    settings: await db.selectFrom('tenant_settings').select('tenant_id').execute(),
    audits: await db
      .selectFrom('audit_events')
      .select('id')
      .where('action', '=', 'tenant.created')
      .execute()
  };

  let thrown: unknown;
  try {
    await createTenantUseCase.execute({
      businessName: 'Duplicate Slug Tenant',
      slug,
      ownerUserId,
      requestId: `tenant-create-duplicate-${stamp}`
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof TenancyError);
  assert.equal((thrown as TenancyError).code, ErrorCode.TenantSlugTaken);

  const afterCounts = {
    tenants: await db.selectFrom('tenants').select('id').execute(),
    domains: await db.selectFrom('tenant_domains').select('id').execute(),
    memberships: await db.selectFrom('tenant_memberships').select('id').execute(),
    settings: await db.selectFrom('tenant_settings').select('tenant_id').execute(),
    audits: await db
      .selectFrom('audit_events')
      .select('id')
      .where('action', '=', 'tenant.created')
      .execute()
  };

  assert.equal(afterCounts.tenants.length, beforeCounts.tenants.length);
  assert.equal(afterCounts.domains.length, beforeCounts.domains.length);
  assert.equal(afterCounts.memberships.length, beforeCounts.memberships.length);
  assert.equal(afterCounts.settings.length, beforeCounts.settings.length);
  assert.equal(afterCounts.audits.length, beforeCounts.audits.length);

  await db.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
