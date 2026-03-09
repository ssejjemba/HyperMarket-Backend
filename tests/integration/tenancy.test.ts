import assert from 'node:assert/strict';

import { createDbClient } from '@hypermarket/core/db';
import { createTenancyRepository } from '@hypermarket/modules/tenancy';
import type { Transaction } from 'kysely';
import type { DatabaseSchema } from '@hypermarket/core';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for tenancy integration tests');
}

const run = async (): Promise<void> => {
  const db = createDbClient(databaseUrl);
  const repo = createTenancyRepository(db);

  const stamp = Date.now();
  const slug = `test-tenant-${stamp}`;
  const domain = `tenant-${stamp}.example.com`;
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

  await db.destroy();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
