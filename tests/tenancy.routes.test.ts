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

const expectErrorEnvelope = (body: ErrorEnvelope): void => {
  expect(typeof body.request_id).toBe('string');
  expect(body.request_id.length).toBeGreaterThan(0);
  expect(body.error_code).toBe(ErrorCode.NotImplemented);
  expect(body.message).toBe('Tenancy route not implemented');
};

describe('TEN routes scaffold', () => {
  it.each([['GET', '/tenants', undefined]])(
    'registers %s %s and returns the shared error envelope',
    async (method, url, payload) => {
      const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
      await server.ready();

      const res = await server.inject({
        method,
        url,
        payload
      });

      expect(res.statusCode).toBe(501);
      expectErrorEnvelope(res.json<ErrorEnvelope>());

      await server.close();
    }
  );
});

const dbAvailable = await canConnectDatabase();
const flowSuite = dbAvailable ? describe : describe.skip;

const issueAccessToken = async (
  ctx: Awaited<ReturnType<typeof createTestContext>>
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
      id: ctx.seed.userId,
      phoneE164: ctx.seed.userPhone,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    })
  );

  return result.accessToken;
};

flowSuite('TEN routes - create tenant', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('POST /tenants without auth returns auth_missing_token', async () => {
    ctx = await createTestContext();
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/tenants',
      payload: { business_name: 'No Auth Tenant' }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.AuthMissingToken);

    await server.close();
  });

  it('POST /tenants returns tenant summary and primary domain for authenticated users', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        business_name: 'Acme Fresh',
        slug: `acme-fresh-${ctx.seed.tenantId.slice(0, 8)}`
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      tenant: { id: string; business_name: string; slug: string; status: string };
      primary_domain: string;
    }>();
    expect(body.tenant.business_name).toBe('Acme Fresh');
    expect(body.tenant.slug).toMatch(/^acme-fresh-/);
    expect(body.tenant.status).toBe('active');
    expect(body.primary_domain).toBe(`${body.tenant.slug}.${ctx.config.platformRootDomain}`);

    await server.close();
  });

  it('POST /tenants returns tenant_slug_taken when slug already exists', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const slug = ctx.seed.tenantSlug;
    const res = await server.inject({
      method: 'POST',
      url: '/tenants',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        business_name: 'Duplicate Tenant',
        slug
      }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantSlugTaken);

    await server.close();
  });

  it('tenant-scoped routes return tenant_membership_not_found when the user has no membership', async () => {
    ctx = await createTestContext();
    await ctx.db
      .insertInto('users')
      .values({
        id: '00000000-0000-0000-0000-000000000010',
        phone_e164: '+256712000010',
        email: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

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
    const access = await sessionService.issueSession(
      new UserIdentity({
        id: '00000000-0000-0000-0000-000000000010',
        phoneE164: '+256712000010',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/settings`,
      headers: { authorization: `Bearer ${access.accessToken}` }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantMembershipNotFound);

    await server.close();
  });

  it('tenant-scoped routes return tenant_membership_revoked when the membership is revoked', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    await ctx.db
      .updateTable('tenant_memberships')
      .set({ status: 'revoked' })
      .where('tenant_id', '=', ctx.seed.tenantId)
      .where('user_id', '=', ctx.seed.userId)
      .execute();

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/settings`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantMembershipRevoked);

    await server.close();
  });
});
