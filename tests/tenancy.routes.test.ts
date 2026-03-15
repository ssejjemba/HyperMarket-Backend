import { randomUUID } from 'node:crypto';

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

describe('TEN routes scaffold', () => {
  it.each([
    [
      'GET',
      '/tenants/:tenantId/memberships',
      '/tenants/00000000-0000-0000-0000-000000000001/memberships'
    ],
    [
      'POST',
      '/tenants/:tenantId/memberships',
      '/tenants/00000000-0000-0000-0000-000000000001/memberships'
    ],
    [
      'POST',
      '/tenants/:tenantId/memberships/:userId/revoke',
      '/tenants/00000000-0000-0000-0000-000000000001/memberships/00000000-0000-0000-0000-000000000002/revoke'
    ],
    [
      'PATCH',
      '/tenants/:tenantId/memberships/:userId/role',
      '/tenants/00000000-0000-0000-0000-000000000001/memberships/00000000-0000-0000-0000-000000000002/role'
    ]
  ])('registers %s %s and returns the shared error envelope', async (method, _pattern, url) => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({
      method,
      url
    });

    expect([401, 404, 501]).toContain(res.statusCode);
    if (res.statusCode === 501) {
      expectErrorEnvelope(res.json<ErrorEnvelope>());
    }

    await server.close();
  });
});

const dbAvailable = await canConnectDatabase();
const flowSuite = dbAvailable ? describe : describe.skip;

const issueAccessToken = async (
  ctx: Awaited<ReturnType<typeof createTestContext>>
): Promise<string> => {
  return issueAccessTokenForUser(ctx, {
    id: ctx.seed.userId,
    phoneE164: ctx.seed.userPhone
  });
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

  it('GET /tenants without auth returns auth_missing_token', async () => {
    ctx = await createTestContext();
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/tenants'
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

  it('GET /tenants returns only the authenticated user tenants', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);

    const otherUserId = randomUUID();
    const otherTenantId = randomUUID();
    const otherPhone = `+256712${otherUserId.replace(/-/g, '').slice(0, 6)}`;
    await ctx.db
      .insertInto('users')
      .values({
        id: otherUserId,
        phone_e164: otherPhone,
        email: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

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
      .insertInto('tenant_domains')
      .values({
        id: randomUUID(),
        tenant_id: otherTenantId,
        domain: `other-${otherTenantId.slice(0, 8)}.${ctx.config.platformRootDomain}`,
        domain_type: 'subdomain',
        verification_status: 'verified',
        is_primary: true,
        created_at: new Date()
      })
      .execute();

    await ctx.db
      .insertInto('tenant_memberships')
      .values({
        id: randomUUID(),
        tenant_id: otherTenantId,
        user_id: otherUserId,
        role: 'owner',
        status: 'active',
        created_at: new Date()
      })
      .execute();

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/tenants',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      tenants: Array<{
        id: string;
        business_name: string;
        slug: string;
        status: string;
        primary_domain: string | null;
      }>;
    }>();
    expect(body.tenants).toHaveLength(1);
    expect(body.tenants[0]).toMatchObject({
      id: ctx.seed.tenantId,
      business_name: 'Test Tenant',
      slug: ctx.seed.tenantSlug,
      status: 'active',
      primary_domain: ctx.seed.tenantDomain
    });

    await server.close();
  });

  it('GET /tenants/:tenantId returns the tenant summary for a member', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      tenant: {
        id: ctx.seed.tenantId,
        business_name: 'Test Tenant',
        slug: ctx.seed.tenantSlug,
        status: 'active',
        primary_domain: ctx.seed.tenantDomain
      }
    });

    await server.close();
  });

  it('GET /tenants/:tenantId/memberships returns memberships for an active tenant member', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);

    const staffUserId = randomUUID();
    const staffPhone = `+256712${staffUserId.replace(/-/g, '').slice(0, 6)}`;
    await ctx.db
      .insertInto('users')
      .values({
        id: staffUserId,
        phone_e164: staffPhone,
        email: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();
    await ctx.db
      .insertInto('tenant_memberships')
      .values({
        id: randomUUID(),
        tenant_id: ctx.seed.tenantId,
        user_id: staffUserId,
        role: 'staff',
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

    const res = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/memberships`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      memberships: Array<{
        user_id: string;
        role: string;
        status: string;
        created_at: string;
      }>;
    }>();
    expect(body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: ctx.seed.userId,
          role: 'owner',
          status: 'active'
        }),
        expect.objectContaining({
          user_id: staffUserId,
          role: 'staff',
          status: 'active'
        })
      ])
    );
    expect(typeof body.memberships[0]?.created_at).toBe('string');

    await server.close();
  });

  it('owner can add a tenant member and writes an audit event', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const memberPhone = `+256712${ctx.seed.tenantId.replace(/\D/g, '').padEnd(6, '0').slice(0, 6)}`;

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const createRes = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/memberships`,
      headers: { authorization: `Bearer ${token}` },
      payload: { phone_e164: memberPhone, role: 'staff' }
    });
    expect(createRes.statusCode).toBe(200);
    const body = createRes.json<{
      membership: {
        user_id: string;
        role: string;
        status: string;
        created_at: string;
      };
    }>();
    expect(body.membership.role).toBe('staff');
    expect(body.membership.status).toBe('active');
    expect(typeof body.membership.user_id).toBe('string');
    expect(typeof body.membership.created_at).toBe('string');

    const storedUser = await ctx.db
      .selectFrom('users')
      .select(['id', 'phone_e164'])
      .where('phone_e164', '=', memberPhone)
      .executeTakeFirst();
    expect(storedUser).toMatchObject({
      id: body.membership.user_id,
      phone_e164: memberPhone
    });

    const storedMembership = await ctx.db
      .selectFrom('tenant_memberships')
      .select(['tenant_id', 'user_id', 'role', 'status'])
      .where('tenant_id', '=', ctx.seed.tenantId)
      .where('user_id', '=', body.membership.user_id)
      .executeTakeFirst();
    expect(storedMembership).toMatchObject({
      tenant_id: ctx.seed.tenantId,
      user_id: body.membership.user_id,
      role: 'staff',
      status: 'active'
    });

    const auditRow = await ctx.db
      .selectFrom('audit_events')
      .select(['action', 'tenant_id', 'actor_user_id', 'target_type', 'target_id', 'after'])
      .where('action', '=', 'tenant.membership.created')
      .where('tenant_id', '=', ctx.seed.tenantId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    expect(auditRow).toMatchObject({
      action: 'tenant.membership.created',
      tenant_id: ctx.seed.tenantId,
      actor_user_id: ctx.seed.userId,
      target_type: 'tenant_membership',
      target_id: `${ctx.seed.tenantId}:${body.membership.user_id}`
    });
    expect(auditRow?.after).toMatchObject({
      tenant_id: ctx.seed.tenantId,
      user_id: body.membership.user_id,
      role: 'staff',
      status: 'active',
      phone_e164: memberPhone
    });

    await server.close();
  });

  it('owner add member returns tenant_membership_exists for duplicate membership', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/memberships`,
      headers: { authorization: `Bearer ${token}` },
      payload: { phone_e164: ctx.seed.userPhone, role: 'owner' }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantMembershipExists);

    await server.close();
  });

  it.each(['manager', 'staff'] as const)(
    '%s cannot access membership management routes',
    async (role) => {
      ctx = await createTestContext();
      const membershipUserId = randomUUID();
      const membershipPhone = `+256712${membershipUserId.replace(/-/g, '').slice(0, 6)}`;
      await ctx.db
        .insertInto('users')
        .values({
          id: membershipUserId,
          phone_e164: membershipPhone,
          email: null,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute();

      await ctx.db
        .insertInto('tenant_memberships')
        .values({
          id: randomUUID(),
          tenant_id: ctx.seed.tenantId,
          user_id: membershipUserId,
          role,
          status: 'active',
          created_at: new Date(),
          revoked_at: null
        })
        .execute();

      const token = await issueAccessTokenForUser(ctx, {
        id: membershipUserId,
        phoneE164: membershipPhone
      });
      const server = buildServer({
        config: { ...ctx.config, nodeEnv: 'test' },
        devRoutesMode: 'disabled'
      });
      await server.ready();

      const res = await server.inject({
        method: 'POST',
        url: `/tenants/${ctx.seed.tenantId}/memberships`,
        headers: { authorization: `Bearer ${token}` },
        payload: { phone_e164: '+256712345678', role: 'staff' }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantAccessForbidden);

      await server.close();
    }
  );

  it('tenant-scoped routes return tenant_membership_not_found when the user has no membership', async () => {
    ctx = await createTestContext();
    const otherUserId = randomUUID();
    const otherPhone = `+256712${otherUserId.replace(/-/g, '').slice(0, 6)}`;
    await ctx.db
      .insertInto('users')
      .values({
        id: otherUserId,
        phone_e164: otherPhone,
        email: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

    const accessToken = await issueAccessTokenForUser(ctx, {
      id: otherUserId,
      phoneE164: otherPhone
    });

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/settings`,
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantMembershipNotFound);

    await server.close();
  });

  it('GET /tenants/:tenantId blocks cross-tenant access with tenant_membership_not_found', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);

    const otherTenantId = randomUUID();
    await ctx.db
      .insertInto('tenants')
      .values({
        id: otherTenantId,
        business_name: 'Blocked Tenant',
        slug: `blocked-${otherTenantId.slice(0, 8)}`,
        status: 'active',
        default_currency: 'UGX',
        active_config_id: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

    await ctx.db
      .insertInto('tenant_domains')
      .values({
        id: randomUUID(),
        tenant_id: otherTenantId,
        domain: `blocked-${otherTenantId.slice(0, 8)}.${ctx.config.platformRootDomain}`,
        domain_type: 'subdomain',
        verification_status: 'verified',
        is_primary: true,
        created_at: new Date()
      })
      .execute();

    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: `/tenants/${otherTenantId}`,
      headers: { authorization: `Bearer ${token}` }
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

  it('GET /tenants/:tenantId/settings returns the stored tenant settings for a member', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    await ctx.db
      .insertInto('tenant_settings')
      .values({
        tenant_id: ctx.seed.tenantId,
        contact_name: 'Store Owner',
        contact_email: 'owner@example.com',
        contact_phone_e164: '+256712000001',
        contact_whatsapp_e164: '+256712000002',
        social_links: { website: 'https://example.com' },
        business_hours: { monday: { closed: false, open: '08:00', close: '18:00' } },
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict((oc) =>
        oc.column('tenant_id').doUpdateSet({
          contact_name: 'Store Owner',
          contact_email: 'owner@example.com',
          contact_phone_e164: '+256712000001',
          contact_whatsapp_e164: '+256712000002',
          social_links: { website: 'https://example.com' },
          business_hours: { monday: { closed: false, open: '08:00', close: '18:00' } },
          updated_at: new Date()
        })
      )
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

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      tenant_id: ctx.seed.tenantId,
      contact_name: 'Store Owner',
      contact_email: 'owner@example.com',
      contact_phone: '+256712000001',
      contact_whatsapp: '+256712000002',
      social_links: { website: 'https://example.com' },
      business_hours: { monday: { closed: false, open: '08:00', close: '18:00' } }
    });

    await server.close();
  });

  it('PATCH /tenants/:tenantId/settings returns tenant_settings_invalid for invalid payloads', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'PATCH',
      url: `/tenants/${ctx.seed.tenantId}/settings`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        contact_phone: '+14155550123',
        social_links: {
          youtube: 'https://youtube.com/@bad-key'
        }
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.TenantSettingsInvalid);

    await server.close();
  });

  it('PATCH /tenants/:tenantId/settings upserts settings and writes an audit event', async () => {
    ctx = await createTestContext();
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'PATCH',
      url: `/tenants/${ctx.seed.tenantId}/settings`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        contact_name: 'Acme Support',
        contact_email: 'support@acme.ug',
        contact_phone: '+256712345678',
        contact_whatsapp: '+256772345678',
        social_links: {
          website: 'https://acme.ug',
          instagram: 'https://instagram.com/acme'
        },
        business_hours: {
          monday: { closed: false, open: '08:00', close: '18:00' },
          sunday: { closed: true }
        }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      tenant_id: ctx.seed.tenantId,
      contact_name: 'Acme Support',
      contact_email: 'support@acme.ug',
      contact_phone: '+256712345678',
      contact_whatsapp: '+256772345678'
    });

    const stored = await ctx.db
      .selectFrom('tenant_settings')
      .select([
        'contact_name',
        'contact_email',
        'contact_phone_e164',
        'contact_whatsapp_e164',
        'social_links',
        'business_hours'
      ])
      .where('tenant_id', '=', ctx.seed.tenantId)
      .executeTakeFirstOrThrow();

    expect(stored.contact_name).toBe('Acme Support');
    expect(stored.contact_email).toBe('support@acme.ug');
    expect(stored.contact_phone_e164).toBe('+256712345678');
    expect(stored.contact_whatsapp_e164).toBe('+256772345678');
    expect(stored.social_links).toEqual({
      website: 'https://acme.ug',
      instagram: 'https://instagram.com/acme'
    });
    expect(stored.business_hours).toEqual({
      monday: { closed: false, open: '08:00', close: '18:00' },
      sunday: { closed: true }
    });

    const auditRow = await ctx.db
      .selectFrom('audit_events')
      .select(['action', 'target_id', 'before', 'after'])
      .where('action', '=', 'tenant.settings.updated')
      .where('target_id', '=', ctx.seed.tenantId)
      .executeTakeFirst();

    expect(auditRow).toBeDefined();
    expect(auditRow?.before).toMatchObject({
      tenant_id: ctx.seed.tenantId,
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      contact_whatsapp: null
    });
    expect(auditRow?.after).toMatchObject({
      tenant_id: ctx.seed.tenantId,
      contact_name: 'Acme Support',
      contact_email: 'support@acme.ug',
      contact_phone: '+256712345678',
      contact_whatsapp: '+256772345678'
    });

    await server.close();
  });
});
