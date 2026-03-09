import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';

import { loadEnv } from '../config/loadEnv';
import { createDbClient } from '../db/client';

export const resetDatabase = async (): Promise<void> => {
  const config = loadEnv();
  const db = createDbClient(config.databaseUrl);

  await db.deleteFrom('auth_otps').execute();
  await db.deleteFrom('sessions').execute();
  await db.deleteFrom('tenant_memberships').execute();
  await db.deleteFrom('tenant_domains').execute();
  await db.deleteFrom('tenants').execute();
  await db.deleteFrom('users').execute();
  await db.deleteFrom('outbox_events').execute();
  await db.deleteFrom('idempotency_keys').execute();
  await db.deleteFrom('audit_events').execute();
  await db.destroy();
};

export type TestSeed = {
  tenantId: string;
  tenantDomain: string;
  tenantSlug: string;
  userId: string;
  userPhone: string;
};

const createSeed = (): TestSeed => {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const phoneSuffix = `${Math.floor(Math.random() * 1_000_000_0000)}`.padStart(10, '0');

  return {
    tenantId: randomUUID(),
    tenantDomain: `test-${suffix}.local`,
    userId: randomUUID(),
    tenantSlug: `tenant-${suffix}`,
    userPhone: `+2567${phoneSuffix.slice(0, 7)}`
  };
};

export const createTestContext = async () => {
  const config = loadEnv();
  const db = createDbClient(config.databaseUrl);

  const seed = createSeed();

  await db
    .insertInto('tenants')
    .values({
      id: seed.tenantId,
      name: 'Test Tenant',
      slug: seed.tenantSlug,
      is_active: true,
      created_at: sql`now()`,
      updated_at: sql`now()`
    })
    .execute();

  await db
    .insertInto('tenant_domains')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: seed.tenantId,
      hostname: seed.tenantDomain,
      is_primary: true,
      created_at: sql`now()`
    })
    .execute();

  await db
    .insertInto('users')
    .values({
      id: seed.userId,
      phone_e164: seed.userPhone,
      email: null,
      is_active: true,
      created_at: sql`now()`,
      updated_at: sql`now()`
    })
    .execute();

  await db
    .insertInto('tenant_memberships')
    .values({
      id: sql`gen_random_uuid()` as unknown as string,
      tenant_id: seed.tenantId,
      user_id: seed.userId,
      role: 'owner',
      created_at: sql`now()`
    })
    .execute();

  return {
    db,
    seed,
    config,
    destroy: async () => {
      await db.destroy();
    }
  };
};

export const canConnectDatabase = async (): Promise<boolean> => {
  try {
    const config = loadEnv();
    const db = createDbClient(config.databaseUrl);
    await db.selectFrom('tenants').select('id').limit(1).execute();
    await db.destroy();
    return true;
  } catch {
    return false;
  }
};
