import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';
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

    expect([401, 404, 501]).toContain(res.statusCode);

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

  it.each([
    ['POST', `/tenants/__TENANT__/publish`, { config_id: '00000000-0000-0000-0000-000000000003' }],
    ['POST', `/tenants/__TENANT__/rollback`, { config_id: '00000000-0000-0000-0000-000000000003' }]
  ])(
    'still returns not_implemented for authenticated tenant members on %s %s',
    async (method, rawUrl, payload) => {
      ctx = await createTestContext();
      const token = await issueAccessTokenForUser(ctx, {
        id: ctx.seed.userId,
        phoneE164: ctx.seed.userPhone
      });
      const url = rawUrl.replace('__TENANT__', ctx.seed.tenantId);
      const server = buildServer({
        config: { ...ctx.config, nodeEnv: 'test' },
        devRoutesMode: 'disabled'
      });
      await server.ready();

      const res = await server.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        payload
      });

      expect(res.statusCode).toBe(501);
      const body = res.json<ErrorEnvelope>();
      expect(typeof body.request_id).toBe('string');
      expect(body.error_code).toBe(ErrorCode.NotImplemented);
      expect(body.message).toBe('Publishing route not implemented');

      await server.close();
    }
  );
});
