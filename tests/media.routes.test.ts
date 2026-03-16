import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import {
  createNoopMediaMetrics,
  createSignedUploadUrlSigner,
  createMediaUseCases
} from '@hypermarket/modules/media';
import {
  UserIdentity,
  createSessionRepoPg,
  createSessionService,
  createTokenSigner
} from '@hypermarket/modules/iaa';

import { buildServer } from '../apps/api/src/server';

type ErrorEnvelope = {
  request_id: string;
  error_code: string;
  message: string;
};

const issueAccessToken = async (
  ctx: Awaited<ReturnType<typeof createTestContext>>,
  user = { id: ctx.seed.userId, phoneE164: ctx.seed.userPhone }
): Promise<string> => {
  const sessionRepo = createSessionRepoPg(ctx.db);
  const tokenSigner = createTokenSigner({
    secret: ctx.config.jwtSecret,
    ttlSeconds: ctx.config.sessionTtlSeconds,
    issuer: ctx.config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: ctx.config.sessionTtlSeconds
  });

  const result = await sessionService.issueSession(
    new UserIdentity({
      id: user.id,
      phoneE164: user.phoneE164,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    })
  );

  return result.accessToken;
};

const dbAvailable = await canConnectDatabase();
const flowSuite = dbAvailable ? describe : describe.skip;

flowSuite('MED routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('rejects upload-token requests with unsupported mime types', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/media/upload-token`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mime_type: 'application/pdf',
        byte_size: 1024
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.MediaMimeNotAllowed);

    await server.close();
  });

  it('creates a pending asset and confirms it', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const issued = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/media/upload-token`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mime_type: 'image/png',
        byte_size: 2048,
        original_filename: 'logo.png'
      }
    });

    expect(issued.statusCode).toBe(200);
    const uploadToken = issued.json<{
      asset_id: string;
      storage_key: string;
      upload_url: string;
    }>();
    expect(uploadToken.upload_url).toContain('https://');

    const confirmed = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/media/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        asset_id: uploadToken.asset_id,
        storage_key: uploadToken.storage_key,
        mime_type: 'image/png',
        byte_size: 2048,
        checksum: 'sha256:test'
      }
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      asset: {
        id: uploadToken.asset_id,
        status: 'confirmed',
        public_url: `https://cdn.platform.ug/${uploadToken.storage_key}`
      }
    });

    await server.close();
  });

  it('fails confirm when the storage key does not match the pending asset', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const issued = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/media/upload-token`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mime_type: 'image/webp',
        byte_size: 1024
      }
    });
    const uploadToken = issued.json<{ asset_id: string; storage_key: string }>();

    const confirmed = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/media/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        asset_id: uploadToken.asset_id,
        storage_key: `${uploadToken.storage_key}-wrong`,
        mime_type: 'image/webp',
        byte_size: 1024
      }
    });

    expect(confirmed.statusCode).toBe(409);
    expect(confirmed.json<ErrorEnvelope>().error_code).toBe(ErrorCode.MediaStorageKeyMismatch);

    await server.close();
  });

  it('lists only tenant assets and soft deletes via owner-only access', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const otherTenantId = randomUUID();

    await ctx.db
      .insertInto('tenants')
      .values({
        id: otherTenantId,
        business_name: 'Other Tenant',
        slug: `other-${otherTenantId.slice(0, 8)}`,
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

    await ctx.db
      .insertInto('tenant_memberships')
      .values({
        id: randomUUID(),
        tenant_id: otherTenantId,
        user_id: ctx.seed.userId,
        role: 'owner',
        status: 'active',
        created_at: new Date(),
        revoked_at: null
      })
      .execute();

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const issued = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/media/upload-token`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        mime_type: 'image/jpeg',
        byte_size: 1024
      }
    });
    const uploadToken = issued.json<{ asset_id: string; storage_key: string }>();

    await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/media/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        asset_id: uploadToken.asset_id,
        storage_key: uploadToken.storage_key,
        mime_type: 'image/jpeg',
        byte_size: 1024
      }
    });

    const list = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/media`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      assets: [
        {
          id: uploadToken.asset_id
        }
      ]
    });

    const foreignList = await server.inject({
      method: 'GET',
      url: `/tenants/${otherTenantId}/media`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(foreignList.statusCode).toBe(200);
    expect(foreignList.json()).toMatchObject({
      assets: []
    });

    const deleted = await server.inject({
      method: 'DELETE',
      url: `/tenants/${ctx.seed.tenantId}/media/${uploadToken.asset_id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({
      asset: {
        id: uploadToken.asset_id,
        status: 'deleted'
      }
    });

    await server.close();
  });

  it('does not log the presigned upload url', async () => {
    ctx = await createTestContext();
    const info = vi.fn();
    const useCases = createMediaUseCases({
      db: ctx.db,
      logger: { info } as never,
      metrics: createNoopMediaMetrics(),
      uploadUrlSigner: createSignedUploadUrlSigner({
        baseUrl: 'https://uploads.platform.ug/direct',
        secret: 'test-secret',
        ttlSeconds: 900
      }),
      maxFileBytes: 5 * 1024 * 1024,
      cdnBaseUrl: 'https://cdn.platform.ug'
    });

    const uploadToken = await useCases.issueUploadToken({
      tenantId: ctx.seed.tenantId,
      actorUserId: ctx.seed.userId,
      mimeType: 'image/png',
      byteSize: 1024,
      originalFilename: 'logo.png'
    });

    expect(uploadToken.uploadUrl).toContain('https://uploads.platform.ug/direct');
    expect(JSON.stringify(info.mock.calls)).not.toContain(uploadToken.uploadUrl);
  });
});
