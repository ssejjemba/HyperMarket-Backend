import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { sql } from '@hypermarket/core/db';
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

const ensureFulfillmentTables = async (db: Awaited<ReturnType<typeof createTestContext>>['db']) => {
  await sql`
    create table if not exists fulfillment_settings (
      tenant_id uuid primary key references tenants(id) on delete cascade,
      pickup_enabled boolean not null default true,
      delivery_enabled boolean not null default false,
      pickup_instructions text null,
      delivery_instructions text null,
      business_hours jsonb not null default '{}'::jsonb,
      cutoff_rules jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists delivery_zones (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      name text not null,
      fee_amount integer not null,
      min_order_amount integer null,
      is_active boolean not null default true,
      sort_order integer not null default 0,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create unique index if not exists delivery_zones_tenant_name_unique
    on delivery_zones (tenant_id, name)
  `.execute(db);
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

flowSuite('FUL routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('manages settings and zones under tenant scope', async () => {
    ctx = await createTestContext();
    await ensureFulfillmentTables(ctx.db);
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const createZone = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/fulfillment/zones`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Central Kampala',
        fee_amount: 5000,
        min_order_amount: 20000
      }
    });

    expect(createZone.statusCode).toBe(200);
    const zoneId = createZone.json<{ zone: { id: string } }>().zone.id;

    const updateSettings = await server.inject({
      method: 'PATCH',
      url: `/tenants/${ctx.seed.tenantId}/fulfillment/settings`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        pickup_enabled: true,
        delivery_enabled: true,
        business_hours: {
          mon: {
            is_closed: false,
            open_time: '09:00',
            close_time: '17:00'
          }
        }
      }
    });

    expect(updateSettings.statusCode).toBe(200);
    expect(updateSettings.json()).toMatchObject({
      settings: {
        pickup_enabled: true,
        delivery_enabled: true
      }
    });

    const outbox = await ctx.db
      .selectFrom('outbox_events')
      .select('event_type')
      .where('tenant_id', '=', ctx.seed.tenantId)
      .orderBy('created_at', 'asc')
      .execute();
    expect(outbox.map((entry) => entry.event_type)).toEqual([
      'Fulfillment.ZoneUpserted',
      'Fulfillment.SettingsUpdated'
    ]);

    const zones = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.seed.tenantId}/fulfillment/zones?include_inactive=false`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(zones.statusCode).toBe(200);
    expect(zones.json()).toMatchObject({
      zones: [{ id: zoneId, name: 'Central Kampala' }]
    });

    const deactivate = await server.inject({
      method: 'DELETE',
      url: `/tenants/${ctx.seed.tenantId}/fulfillment/zones/${zoneId}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(deactivate.statusCode).toBe(409);
    expect(deactivate.json<ErrorEnvelope>().error_code).toBe(
      ErrorCode.FulDeliveryEnabledWithoutZones
    );

    await server.close();
  });

  it('rejects invalid settings updates and returns public options', async () => {
    ctx = await createTestContext();
    await ensureFulfillmentTables(ctx.db);
    const token = await issueAccessToken(ctx);
    const server = buildServer({
      config: { ...ctx.config, nodeEnv: 'test' },
      devRoutesMode: 'disabled'
    });
    await server.ready();

    const invalid = await server.inject({
      method: 'PATCH',
      url: `/tenants/${ctx.seed.tenantId}/fulfillment/settings`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        pickup_enabled: false,
        delivery_enabled: false
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<ErrorEnvelope>().error_code).toBe(ErrorCode.FulNoFulfillmentModeEnabled);

    await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.seed.tenantId}/fulfillment/zones`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Ntinda',
        fee_amount: 3500,
        sort_order: 2
      }
    });

    await server.inject({
      method: 'PATCH',
      url: `/tenants/${ctx.seed.tenantId}/fulfillment/settings`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        delivery_enabled: true,
        delivery_instructions: 'Call on arrival'
      }
    });

    const options = await server.inject({
      method: 'GET',
      url: `/storefront/${ctx.seed.tenantSlug}/fulfillment/options`
    });

    expect(options.statusCode).toBe(200);
    expect(options.json()).toMatchObject({
      fulfillment: {
        pickup_enabled: true,
        delivery_enabled: true,
        delivery_instructions: 'Call on arrival',
        currency: 'UGX',
        delivery_zones: [{ name: 'Ntinda', fee_amount: 3500 }]
      }
    });

    await server.close();
  });
});
