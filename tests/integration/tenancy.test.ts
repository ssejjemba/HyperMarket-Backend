import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import type { Transaction } from 'kysely';

import type { DatabaseSchema } from '../../packages/core/src/db/client';
import { loadEnv } from '../../packages/core/src/config/loadEnv';
import { createDbClient } from '../../packages/core/src/db/index';
import { createTenancyRepository } from '../../packages/modules/src/tenancy/index';

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
  const repo = createTenancyRepository(db, {
    platformRootDomain: config.platformRootDomain
  });

  const stamp = Date.now();
  const slug = `test-tenant-${stamp}`;
  const domain = `${slug}.${config.platformRootDomain}`;
  const ownerUserId = '00000000-0000-0000-0000-000000000001';

  const tenant = await db.transaction().execute(async (trx: Transaction<DatabaseSchema>) => {
    return repo.createTenant(trx, {
      name: 'Test Tenant',
      slug,
      ownerUserId,
      domain
    });
  });

  const resolvedTenantId = await repo.resolveTenantByDomain(domain);
  assert.equal(resolvedTenantId, tenant.id);

  const list = await repo.listTenantsForUser(ownerUserId);
  assert.ok(list.some((item) => item.id === tenant.id));

  const otherList = await repo.listTenantsForUser('00000000-0000-0000-0000-000000000002');
  assert.ok(otherList.every((item) => item.id !== tenant.id));

  await assert.rejects(
    () =>
      db.transaction().execute(async (trx: Transaction<DatabaseSchema>) =>
        repo.createTenant(trx, {
          name: 'Duplicate Slug Tenant',
          slug,
          ownerUserId,
          domain: `other-${stamp}.${config.platformRootDomain}`
        })
      ),
    /tenant/i
  );

  await assert.rejects(
    () =>
      db.transaction().execute(async (trx: Transaction<DatabaseSchema>) =>
        repo.createTenant(trx, {
          name: 'Duplicate Domain Tenant',
          slug: `other-${slug}`,
          ownerUserId,
          domain
        })
      ),
    /tenant/i
  );

  await db.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
