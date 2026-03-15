import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import type { Transaction } from 'kysely';

import type { DatabaseSchema } from '../../packages/core/src/db/client';
import { loadEnv } from '../../packages/core/src/config/loadEnv';
import { createDbClient } from '../../packages/core/src/db/index';
import {
  createTenantDomainRepoPg,
  createTenantMembershipRepoPg,
  createTenantRepoPg,
  createTenantSettingsRepoPg
} from '../../packages/modules/src/tenancy/index';

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

  const stamp = Date.now();
  const slug = `test-tenant-${stamp}`;
  const domain = `${slug}.${config.platformRootDomain}`;
  const ownerUserId = '00000000-0000-0000-0000-000000000001';
  const memberUserId = '00000000-0000-0000-0000-000000000003';

  const tenant = await db.transaction().execute(async (trx: Transaction<DatabaseSchema>) => {
    return tenantRepo.createTenant(trx, {
      name: 'Test Tenant',
      slug,
      status: 'active'
    });
  });

  const createdDomain = await domainRepo.createDomainMapping({
    tenantId: tenant.id,
    domain,
    type: 'subdomain',
    status: 'verified',
    isPrimary: true
  });
  assert.equal(createdDomain.tenantId, tenant.id);

  const createdMembership = await membershipRepo.createMembership(tenant.id, ownerUserId, 'owner');
  assert.equal(createdMembership.tenantId, tenant.id);
  assert.equal(createdMembership.userId, ownerUserId);

  await membershipRepo.createMembership(tenant.id, memberUserId, 'staff');

  const upsertedSettings = await settingsRepo.upsertSettings(tenant.id, {
    contactEmail: 'owner@example.com',
    socialLinks: { instagram: '@tenant' }
  });
  assert.equal(upsertedSettings.tenantId, tenant.id);
  assert.equal(upsertedSettings.contactEmail, 'owner@example.com');

  const resolvedTenantId = await domainRepo.findTenantIdByDomain(domain);
  assert.equal(resolvedTenantId, tenant.id);

  const list = await tenantRepo.listForUser(ownerUserId);
  assert.ok(list.some((item) => item.id === tenant.id));

  const memberships = await membershipRepo.listMemberships(ownerUserId);
  assert.ok(memberships.some((item) => item.tenantId === tenant.id && item.userId === ownerUserId));

  const listedDomains = await domainRepo.listDomains(tenant.id);
  assert.ok(listedDomains.some((item) => item.domain === domain));

  const storedSettings = await settingsRepo.getSettings(tenant.id);
  assert.equal(storedSettings.contactEmail, 'owner@example.com');

  const otherList = await tenantRepo.listForUser('00000000-0000-0000-0000-000000000002');
  assert.ok(otherList.every((item) => item.id !== tenant.id));

  await assert.rejects(
    () =>
      db.transaction().execute(async (trx: Transaction<DatabaseSchema>) =>
        tenantRepo.createTenant(trx, {
          name: 'Duplicate Slug Tenant',
          slug,
          status: 'active'
        })
      ),
    /tenant/i
  );

  await assert.rejects(
    () =>
      domainRepo.createDomainMapping({
        tenantId: tenant.id,
        domain,
        type: 'subdomain',
        status: 'verified',
        isPrimary: false
      }),
    /tenant/i
  );

  await assert.rejects(
    () => membershipRepo.createMembership(tenant.id, ownerUserId, 'owner'),
    /tenant_memberships|unique/i
  );

  await db.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
