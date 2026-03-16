import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

import { createDbClient, sql } from '../../packages/core/src/db/index';
import {
  createInMemoryMediaMetrics,
  createMediaUseCases,
  createSignedUploadUrlSigner
} from '../../packages/modules/src/media/index';
import { createLogger } from '../../packages/core/src/observability/logger';
import { loadEnv } from '../../packages/core/src/config/loadEnv';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '../..');

loadDotenv({ path: path.join(rootDir, '.env.example') });
loadDotenv({ path: path.join(rootDir, '.env'), override: true });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for media integration tests');
}

const ensureMediaAssetsTable = async (db: ReturnType<typeof createDbClient>): Promise<void> => {
  await sql`
    create table if not exists media_assets (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      storage_key text not null,
      mime_type text not null,
      byte_size bigint not null,
      width integer null,
      height integer null,
      checksum text null,
      status text not null,
      created_by_user_id uuid null references users(id) on delete set null,
      created_at timestamptz not null default now(),
      deleted_at timestamptz null
    )
  `.execute(db);
};

const run = async (): Promise<void> => {
  const db = createDbClient(databaseUrl);
  await ensureMediaAssetsTable(db);
  const config = loadEnv();
  const logger = createLogger({ config, base: { service: 'media-test' } });
  const metrics = createInMemoryMediaMetrics();
  const useCases = createMediaUseCases({
    db,
    logger,
    metrics,
    uploadUrlSigner: createSignedUploadUrlSigner({
      baseUrl: config.mediaUploadBaseUrl,
      secret: config.jwtSecret,
      ttlSeconds: config.mediaUploadUrlTtlSeconds
    }),
    maxFileBytes: config.mediaMaxFileBytes,
    cdnBaseUrl: config.mediaCdnBaseUrl
  });
  const suffix = Date.now().toString().slice(-12).padStart(12, '0');
  const tenantA = `60000000-0000-0000-0000-${suffix}`;
  const tenantB = `70000000-0000-0000-0000-${suffix}`;
  const userId = `80000000-0000-0000-0000-${suffix}`;

  await db
    .insertInto('users')
    .values({
      id: userId,
      phone_e164: `+25679${suffix.slice(-8)}`,
      email: null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await db
    .insertInto('tenants')
    .values([
      {
        id: tenantA,
        slug: `media-a-${suffix}`,
        business_name: 'Media A',
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: tenantB,
        slug: `media-b-${suffix}`,
        business_name: 'Media B',
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    ])
    .execute();

  const issued = await useCases.issueUploadToken({
    tenantId: tenantA,
    actorUserId: userId,
    mimeType: 'image/png',
    byteSize: 1024,
    originalFilename: 'hero.png'
  });

  const pending = await db
    .selectFrom('media_assets')
    .select(['id', 'tenant_id', 'status', 'storage_key'])
    .where('id', '=', issued.assetId)
    .executeTakeFirstOrThrow();

  assert.equal(pending.tenant_id, tenantA);
  assert.equal(pending.status, 'uploaded');
  assert.match(pending.storage_key, new RegExp(`^tenants/${tenantA}/assets/${issued.assetId}`));

  const confirmed = await useCases.confirmUpload({
    tenantId: tenantA,
    actorUserId: userId,
    assetId: issued.assetId,
    storageKey: issued.storageKey,
    mimeType: 'image/png',
    byteSize: 1024
  });

  assert.equal(confirmed.status, 'confirmed');

  let crossTenantConfirmError: unknown;
  try {
    await useCases.confirmUpload({
      tenantId: tenantB,
      actorUserId: userId,
      assetId: issued.assetId,
      storageKey: issued.storageKey,
      mimeType: 'image/png',
      byteSize: 1024
    });
  } catch (error) {
    crossTenantConfirmError = error;
  }

  assert.ok(crossTenantConfirmError instanceof Error);
  assert.match(crossTenantConfirmError.message, /Media asset not found/);

  const deleted = await useCases.deleteAsset({
    tenantId: tenantA,
    actorUserId: userId,
    assetId: issued.assetId
  });

  assert.equal(deleted.status, 'deleted');
  assert.equal(metrics.counters.uploadTokenIssuedTotal[0]?.outcome, 'success');
  assert.equal(metrics.counters.assetConfirmTotal[0]?.outcome, 'success');
  assert.equal(metrics.counters.assetDeleteTotal[0]?.outcome, 'success');

  await db.destroy();
};

await run();
