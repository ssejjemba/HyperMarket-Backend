import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';
import {
  UserIdentity,
  createSessionRepoPg,
  createSessionService,
  createTokenSigner,
  createUserRepoPg
} from '@hypermarket/modules/iaa';

import { buildServer } from '../apps/api/src/server';
import { enqueueStorefrontRevalidationJob } from '../apps/worker/src/revalidation/storefrontRevalidationQueue';

const TEST_CONFIG: AppConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgres://tester:tester@127.0.0.1:5432/hypermarket_test',
  redisUrl: 'redis://127.0.0.1:6379',
  port: 3000,
  logLevel: 'silent',
  jwtSecret: 'test-jwt-secret-minimum-32-characters',
  jwtIssuer: 'test-suite',
  twilioAccountSid: 'ACtestaccountsid000000000000000000',
  twilioAuthToken: 'test-twilio-auth-token',
  twilioVerifyServiceSid: 'VAtestservicesid000000000000000000',
  platformRootDomain: 'platform.ug',
  otpSecret: 'test-otp-secret-minimum-32-characters',
  otpTtlSeconds: 300,
  sessionTtlSeconds: 3600,
  enableDevRoutes: false
};

const issueAccessTokenForUser = async (
  ctx: Awaited<ReturnType<typeof createTestContext>>,
  user: { id: string; phoneE164: string }
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

describe('PUB routes scaffold', () => {
  it.each([
    ['POST', '/tenants/00000000-0000-0000-0000-000000000001/configs'],
    ['GET', '/tenants/00000000-0000-0000-0000-000000000001/configs'],
    [
      'GET',
      '/tenants/00000000-0000-0000-0000-000000000001/configs/00000000-0000-0000-0000-000000000002'
    ],
    [
      'PATCH',
      '/tenants/00000000-0000-0000-0000-000000000001/configs/00000000-0000-0000-0000-000000000002'
    ],
    ['POST', '/tenants/00000000-0000-0000-0000-000000000001/publish'],
    ['POST', '/tenants/00000000-0000-0000-0000-000000000001/rollback']
  ])('registers %s %s and is guarded', async (method, url) => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method, url });

    expect([401, 403, 404, 501]).toContain(res.statusCode);

    await server.close();
  });
});

flowSuite('PUB routes scaffold - membership guarded placeholders', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('creates a draft config successfully', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1'
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      config: {
        tenant_id: ctx.seed.tenantId,
        status: 'draft',
        template_id: 'basic-commerce',
        template_version: 'v1',
        config_version: 1,
        validation_report: {
          isValid: true,
          errors: []
        },
        created_by_user_id: ctx.seed.userId
      }
    });

    const auditRow = await ctx.db
      .selectFrom('audit_events')
      .select(['action', 'target_type'])
      .where('action', '=', 'config.draft.created')
      .executeTakeFirst();

    expect(auditRow).toEqual({
      action: 'config.draft.created',
      target_type: 'store_config'
    });

    await server.close();
  });

  it('returns config_invalid_payload with validation details', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1',
        config_payload: {
          hero_title: 'Fresh products for Kampala',
          hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
          primary_color: '#0B6E4F',
          cta_label: 'Shop now'
        }
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      request_id: expect.any(String),
      error_code: ErrorCode.ConfigInvalidPayload,
      message: 'Config payload is invalid',
      details: {
        template_id: 'basic-commerce',
        template_version: 'v1',
        errors: [
          {
            path: '/brand_name',
            code: 'invalid_type',
            message: 'Required'
          }
        ]
      }
    });

    await server.close();
  });

  it('rejects updates for non-draft configs', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const created = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1'
      }
    });
    const configId = created.json<{ config: { id: string } }>().config.id;

    await ctx.db
      .updateTable('store_configs')
      .set({ status: 'active' })
      .where('id', '=', configId)
      .execute();

    const res = await server.inject({
      method: 'PATCH',
      url: `/tenants/${ctx.seed.tenantId}/configs/${configId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_payload: {
          brand_name: 'Updated Shop',
          hero_title: 'Fresh products for Kampala',
          hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
          primary_color: '#0B6E4F',
          cta_label: 'Shop now'
        }
      }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      request_id: expect.any(String),
      error_code: ErrorCode.ConfigNotDraft,
      message: 'Only draft configs can be updated'
    });

    await server.close();
  });

  it('blocks non-owner publish attempts', async () => {
    ctx = await createTestContext();
    const managerPhone = `+256799${Date.now().toString().slice(-6)}`;
    const managerUser = await createUserRepoPg(ctx.db).createWithPhone(managerPhone);
    await ctx.db
      .insertInto('tenant_memberships')
      .values({
        id: crypto.randomUUID(),
        tenant_id: ctx.seed.tenantId,
        user_id: managerUser.id,
        role: 'manager',
        status: 'active',
        created_at: new Date(),
        revoked_at: null
      })
      .execute();

    const token = await issueAccessTokenForUser(ctx, {
      id: managerUser.id,
      phoneE164: managerPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: crypto.randomUUID()
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      request_id: expect.any(String),
      error_code: ErrorCode.TenantAccessForbidden,
      message: 'Tenant owner access required'
    });

    await server.close();
  });

  it('publishes a valid draft config for tenant owners', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const created = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1'
      }
    });
    const configId = created.json<{ config: { id: string } }>().config.id;

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: configId
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      publish: {
        config_id: configId,
        active_config_id: configId,
        previous_config_id: null
      }
    });

    await server.close();
  });

  it('completes the draft to publish flow with history, outbox, and revalidation dispatch payload', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const created = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1'
      }
    });
    const configId = created.json<{ config: { id: string } }>().config.id;

    const publish = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: configId
      }
    });

    expect(publish.statusCode).toBe(200);

    const tenantRow = await ctx.db
      .selectFrom('tenants')
      .select('active_config_id')
      .where('id', '=', ctx.seed.tenantId)
      .executeTakeFirst();

    expect(tenantRow?.active_config_id).toBe(configId);

    const publishHistory = await ctx.db
      .selectFrom('publish_history')
      .select(['action', 'from_config_id', 'to_config_id', 'result'])
      .where('tenant_id', '=', ctx.seed.tenantId)
      .where('to_config_id', '=', configId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    expect(publishHistory).toEqual({
      action: 'publish',
      from_config_id: null,
      to_config_id: configId,
      result: 'success'
    });

    const outboxEvent = await ctx.db
      .selectFrom('outbox_events')
      .select(['id', 'event_type', 'tenant_id', 'actor_user_id', 'payload'])
      .where('tenant_id', '=', ctx.seed.tenantId)
      .where('event_type', '=', 'Publish.Completed')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();

    expect(outboxEvent).toMatchObject({
      event_type: 'Publish.Completed',
      tenant_id: ctx.seed.tenantId,
      actor_user_id: ctx.seed.userId,
      payload: {
        tenant_id: ctx.seed.tenantId,
        config_id: configId,
        previous_config_id: null,
        targets: ['/', '/sitemap.xml', '/robots.txt']
      }
    });

    const queuedJobs: Array<{ name: string; data: unknown }> = [];
    const enqueued = await enqueueStorefrontRevalidationJob(
      {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return {} as never;
        }
      },
      {
        id: outboxEvent.id,
        eventType: outboxEvent.event_type,
        tenantId: outboxEvent.tenant_id,
        correlationId: null,
        actorUserId: outboxEvent.actor_user_id,
        payload: outboxEvent.payload,
        occurredAt: new Date(),
        availableAt: new Date(),
        dispatchedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date()
      }
    );

    expect(enqueued).toBe(true);
    expect(queuedJobs).toEqual([
      {
        name: 'storefront.revalidate',
        data: {
          event_type: 'Publish.Completed',
          tenant_id: ctx.seed.tenantId,
          config_id: configId,
          previous_config_id: null,
          targets: ['/', '/sitemap.xml', '/robots.txt']
        }
      }
    ]);

    await server.close();
  });

  it('returns publish_validation_failed for invalid publish targets', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const { id: configId } = await ctx.db
      .insertInto('store_configs')
      .values({
        id: crypto.randomUUID(),
        tenant_id: ctx.seed.tenantId,
        status: 'draft',
        template_id: 'basic-commerce',
        template_version: 'v1',
        config_version: 1,
        config_payload: {
          hero_title: 'Fresh products for Kampala'
        },
        validation_report: null,
        created_by_user_id: ctx.seed.userId,
        created_at: new Date()
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: configId
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      request_id: expect.any(String),
      error_code: ErrorCode.PublishValidationFailed,
      message: 'Config cannot be published because validation failed'
    });

    await server.close();
  });

  it('blocks non-owner rollback attempts', async () => {
    ctx = await createTestContext();
    const managerPhone = `+256798${Date.now().toString().slice(-6)}`;
    const managerUser = await createUserRepoPg(ctx.db).createWithPhone(managerPhone);
    await ctx.db
      .insertInto('tenant_memberships')
      .values({
        id: crypto.randomUUID(),
        tenant_id: ctx.seed.tenantId,
        user_id: managerUser.id,
        role: 'manager',
        status: 'active',
        created_at: new Date(),
        revoked_at: null
      })
      .execute();

    const token = await issueAccessTokenForUser(ctx, {
      id: managerUser.id,
      phoneE164: managerPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/rollback`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: crypto.randomUUID()
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      request_id: expect.any(String),
      error_code: ErrorCode.TenantAccessForbidden,
      message: 'Tenant owner access required'
    });

    await server.close();
  });

  it('rolls back to a previous valid config for tenant owners', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const firstDraft = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1'
      }
    });
    const firstConfigId = firstDraft.json<{ config: { id: string } }>().config.id;

    const secondDraft = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1',
        config_payload: {
          brand_name: 'HyperMart Express',
          hero_title: 'Shop Kampala in minutes',
          hero_subtitle: 'A faster storefront for repeat customers.',
          primary_color: '#14532D',
          cta_label: 'Browse deals'
        }
      }
    });
    const secondConfigId = secondDraft.json<{ config: { id: string } }>().config.id;

    const publish = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: secondConfigId
      }
    });

    expect(publish.statusCode).toBe(200);

    const rollback = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/rollback`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: firstConfigId
      }
    });

    expect(rollback.statusCode).toBe(200);
    expect(rollback.json()).toEqual({
      rollback: {
        config_id: firstConfigId,
        active_config_id: firstConfigId,
        previous_config_id: secondConfigId
      }
    });

    await server.close();
  });

  it('completes publish to rollback flow with history, outbox, and revalidation dispatch payload', async () => {
    ctx = await createTestContext();
    const token = await issueAccessTokenForUser(ctx, {
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone
    });
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const firstDraft = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1'
      }
    });
    const firstConfigId = firstDraft.json<{ config: { id: string } }>().config.id;

    const secondDraft = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/configs`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        template_id: 'basic-commerce',
        template_version: 'v1',
        config_payload: {
          brand_name: 'HyperMart Express',
          hero_title: 'Shop Kampala in minutes',
          hero_subtitle: 'A faster storefront for repeat customers.',
          primary_color: '#14532D',
          cta_label: 'Browse deals'
        }
      }
    });
    const secondConfigId = secondDraft.json<{ config: { id: string } }>().config.id;

    const publish = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/publish`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: secondConfigId
      }
    });

    expect(publish.statusCode).toBe(200);

    const rollback = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/rollback`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        config_id: firstConfigId
      }
    });

    expect(rollback.statusCode).toBe(200);

    const tenantRow = await ctx.db
      .selectFrom('tenants')
      .select('active_config_id')
      .where('id', '=', ctx.seed.tenantId)
      .executeTakeFirst();

    expect(tenantRow?.active_config_id).toBe(firstConfigId);

    const rollbackHistory = await ctx.db
      .selectFrom('publish_history')
      .select(['action', 'from_config_id', 'to_config_id', 'result'])
      .where('tenant_id', '=', ctx.seed.tenantId)
      .where('action', '=', 'rollback')
      .where('to_config_id', '=', firstConfigId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    expect(rollbackHistory).toEqual({
      action: 'rollback',
      from_config_id: secondConfigId,
      to_config_id: firstConfigId,
      result: 'success'
    });

    const outboxEvent = await ctx.db
      .selectFrom('outbox_events')
      .select(['id', 'event_type', 'tenant_id', 'actor_user_id', 'payload'])
      .where('tenant_id', '=', ctx.seed.tenantId)
      .where('event_type', '=', 'Rollback.Completed')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();

    expect(outboxEvent).toMatchObject({
      event_type: 'Rollback.Completed',
      tenant_id: ctx.seed.tenantId,
      actor_user_id: ctx.seed.userId,
      payload: {
        tenant_id: ctx.seed.tenantId,
        config_id: firstConfigId,
        previous_config_id: secondConfigId,
        targets: ['/', '/sitemap.xml', '/robots.txt']
      }
    });

    const queuedJobs: Array<{ name: string; data: unknown }> = [];
    const enqueued = await enqueueStorefrontRevalidationJob(
      {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return {} as never;
        }
      },
      {
        id: outboxEvent.id,
        eventType: outboxEvent.event_type,
        tenantId: outboxEvent.tenant_id,
        correlationId: null,
        actorUserId: outboxEvent.actor_user_id,
        payload: outboxEvent.payload,
        occurredAt: new Date(),
        availableAt: new Date(),
        dispatchedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date()
      }
    );

    expect(enqueued).toBe(true);
    expect(queuedJobs).toEqual([
      {
        name: 'storefront.revalidate',
        data: {
          event_type: 'Rollback.Completed',
          tenant_id: ctx.seed.tenantId,
          config_id: firstConfigId,
          previous_config_id: secondConfigId,
          targets: ['/', '/sitemap.xml', '/robots.txt']
        }
      }
    ]);

    await server.close();
  });
});
