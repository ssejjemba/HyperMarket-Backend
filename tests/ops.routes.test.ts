import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';

import { createDbClient } from '@hypermarket/core/db';
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
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://hypermarket:hypermarket@localhost:5432/hypermarket',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  port: 3000,
  logLevel: 'silent',
  jwtSecret: 'test-jwt-secret-minimum-32-characters',
  jwtIssuer: 'test-suite',
  twilioAccountSid: 'ACtestaccountsid000000000000000000',
  twilioAuthToken: 'test-twilio-auth-token',
  twilioVerifyServiceSid: 'VAtestservicesid000000000000000000',
  platformRootDomain: 'platform.ug',
  mediaCdnBaseUrl: 'http://localhost:3002/cdn',
  mediaUploadBaseUrl: 'http://localhost:3002/uploads',
  mediaUploadUrlTtlSeconds: 900,
  mediaMaxFileBytes: 5 * 1024 * 1024,
  paymentDefaultProvider: 'flutterwave',
  paymentReconciliationStaleMinutes: 10,
  flwSecretKey: 'FLWSECK_TEST_PLACEHOLDER',
  flwWebhookSecretHash: 'test-flw-webhook-hash',
  flwBaseUrl: 'https://api.flutterwave.com',
  flwDefaultNetwork: 'MTN',
  notificationDefaultProvider: 'twilio_sms',
  notificationDefaultChannel: 'sms',
  twilioSmsFrom: '+256700000000',
  publicOrderRateLimitWindowSeconds: 60,
  publicOrderRateLimitMax: 20,
  publicPaymentRateLimitWindowSeconds: 60,
  publicPaymentRateLimitMax: 10,
  workerMetricsHost: '127.0.0.1',
  workerMetricsPort: 9464,
  otpSecret: 'test-otp-secret-minimum-32-characters',
  otpTtlSeconds: 300,
  sessionTtlSeconds: 3600,
  enableDevRoutes: false
};

const createQueueConnection = (redisUrl: string) => {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    maxRetriesPerRequest: null
  };
};

const createContext = async () => {
  const db = createDbClient(TEST_CONFIG.databaseUrl);
  const suffix = randomUUID().slice(0, 8);
  const tenantId = randomUUID();
  const userId = randomUUID();
  const userPhone = `+25670${Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0')}`;
  const now = new Date();
  const connection = createQueueConnection(TEST_CONFIG.redisUrl);
  const notificationsDlq = new Queue('notifications.dispatch.dlq', { connection });
  const notificationsPrimary = new Queue('notifications.dispatch', { connection });

  await db
    .insertInto('tenants')
    .values({
      id: tenantId,
      business_name: 'Ops Tenant',
      slug: `ops-tenant-${suffix}`,
      status: 'active',
      default_currency: 'UGX',
      active_config_id: null,
      created_at: now,
      updated_at: now
    })
    .execute();

  await db
    .insertInto('users')
    .values({
      id: userId,
      phone_e164: userPhone,
      email: 'owner@example.com',
      is_active: true,
      created_at: now,
      updated_at: now
    })
    .execute();

  await db
    .insertInto('tenant_memberships')
    .values({
      id: randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      role: 'owner',
      status: 'active',
      created_at: now,
      revoked_at: null
    })
    .execute();

  await db
    .insertInto('tenant_settings')
    .values({
      tenant_id: tenantId,
      contact_name: 'Ops Owner',
      contact_email: 'ops@example.com',
      contact_phone_e164: '+256700000000',
      contact_whatsapp_e164: '+256700000000',
      social_links: {},
      business_hours: {},
      created_at: now,
      updated_at: now
    })
    .execute();

  return {
    db,
    tenantId,
    userId,
    userPhone,
    notificationsDlq,
    notificationsPrimary,
    async destroy() {
      await Promise.all([notificationsDlq.drain(), notificationsPrimary.drain()]);
      await Promise.all([notificationsDlq.close(), notificationsPrimary.close()]);
      await db.destroy();
    }
  };
};

const issueAccessToken = async (
  ctx: Awaited<ReturnType<typeof createContext>>
): Promise<string> => {
  const sessionRepo = createSessionRepoPg(ctx.db);
  const tokenSigner = createTokenSigner({
    secret: TEST_CONFIG.jwtSecret,
    ttlSeconds: TEST_CONFIG.sessionTtlSeconds,
    issuer: TEST_CONFIG.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: TEST_CONFIG.sessionTtlSeconds
  });

  const result = await sessionService.issueSession(
    new UserIdentity({
      id: ctx.userId,
      phoneE164: ctx.userPhone,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    })
  );

  return result.accessToken;
};

const seedOpsRecords = async (ctx: Awaited<ReturnType<typeof createContext>>) => {
  const orderId = randomUUID();
  const outboxId = randomUUID();
  const notificationJobId = randomUUID();

  await ctx.db
    .insertInto('orders')
    .values({
      id: orderId,
      tenant_id: ctx.tenantId,
      order_number: 1,
      status: 'PENDING',
      checkout_mode: 'gateway_payment',
      currency: 'UGX',
      subtotal_amount: 12000,
      delivery_fee_amount: 0,
      discount_amount: 0,
      total_amount: 12000,
      customer_id: null,
      customer_snapshot: {
        full_name: 'Ops Customer',
        phone_e164: '+256700000001'
      },
      fulfillment_snapshot: {
        type: 'pickup',
        pickup_location_label: 'Kampala'
      },
      notes: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await ctx.db
    .insertInto('outbox_events')
    .values({
      id: outboxId,
      event_type: 'Order.Created',
      tenant_id: ctx.tenantId,
      correlation_id: orderId,
      actor_user_id: ctx.userId,
      payload: {
        tenant_id: ctx.tenantId,
        order_id: orderId,
        order_number: 1
      },
      occurred_at: new Date(),
      available_at: new Date(),
      dispatched_at: null,
      attempts: 1,
      last_error: 'worker_down',
      created_at: new Date()
    })
    .execute();

  await ctx.db
    .insertInto('payment_intents')
    .values({
      id: randomUUID(),
      tenant_id: ctx.tenantId,
      order_id: orderId,
      provider: 'flutterwave',
      method: 'mobile_money',
      status: 'AWAITING_CUSTOMER',
      amount: 12000,
      currency: 'UGX',
      tx_ref: `t:${ctx.tenantId}:o:${orderId}:pi:test:ts:1`,
      provider_reference: 'flw-ref-1',
      provider_transaction_id: 'flw-tx-1',
      customer_phone_e164: '+256700000001',
      customer_email: 'customer@example.com',
      network: 'MTN',
      failure_code: null,
      failure_message: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await ctx.db
    .insertInto('notification_jobs')
    .values({
      id: notificationJobId,
      tenant_id: ctx.tenantId,
      event_id: outboxId,
      event_type: 'Order.Created',
      channel: 'sms',
      recipient: '+256700000001',
      template_id: 'customer.order_confirmation',
      template_version: 1,
      payload: {
        order_number: 1,
        total_amount: 12000,
        currency: 'UGX',
        store_name: 'Ops Tenant'
      },
      dedupe_key: `dedupe-${randomUUID()}`,
      status: 'FAILED_RETRYABLE',
      attempt_count: 1,
      last_error_code: 'not_provider_unavailable',
      last_error_message: 'temporary outage',
      provider: 'twilio_sms',
      provider_message_id: null,
      created_at: new Date(),
      updated_at: new Date()
    })
    .execute();

  await ctx.db
    .insertInto('notification_delivery_attempts')
    .values({
      id: randomUUID(),
      tenant_id: ctx.tenantId,
      job_id: notificationJobId,
      attempt_number: 1,
      provider: 'twilio_sms',
      result: 'failed',
      error_code: 'not_provider_unavailable',
      error_message: 'temporary outage',
      provider_message_id: null,
      created_at: new Date()
    })
    .execute();

  const dlqJob = await ctx.notificationsDlq.add('notifications.dispatch.dlq', {
    job_id: notificationJobId,
    tenant_id: ctx.tenantId,
    error_message: 'temporary outage'
  });

  return {
    notificationJobId,
    dlqJobId: dlqJob.id?.toString() ?? ''
  };
};

const canConnect = async (): Promise<boolean> => {
  try {
    const db = createDbClient(TEST_CONFIG.databaseUrl);
    await db.selectFrom('tenants').select('id').limit(1).execute();
    await db.destroy();
    return true;
  } catch {
    return false;
  }
};

const dbAvailable = await canConnect();
const suite = dbAvailable ? describe : describe.skip;

suite('OPS routes', () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('returns tenant-scoped ops visibility and replays dlq jobs', async () => {
    ctx = await createContext();
    const seeded = await seedOpsRecords(ctx);
    const token = await issueAccessToken(ctx);
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const summary = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.tenantId}/ops/summary`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      outbox: {
        pending: 1,
        failed: 1
      },
      payments: {
        AWAITING_CUSTOMER: 1
      },
      notifications: {
        FAILED_RETRYABLE: 1
      }
    });

    const outbox = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.tenantId}/ops/outbox?status=failed&limit=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(outbox.statusCode).toBe(200);
    expect(
      outbox.json<{ events: Array<{ event_type: string; last_error: string | null }> }>()
    ).toMatchObject({
      events: [{ event_type: 'Order.Created', last_error: 'worker_down' }]
    });

    const payments = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.tenantId}/ops/payments?status=AWAITING_CUSTOMER`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(payments.statusCode).toBe(200);
    expect(payments.json<{ intents: Array<{ provider: string }> }>()).toMatchObject({
      intents: [{ provider: 'flutterwave' }]
    });

    const notifications = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.tenantId}/ops/notifications?status=FAILED_RETRYABLE`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json<{ jobs: Array<{ id: string; status: string }> }>()).toMatchObject({
      jobs: [{ id: seeded.notificationJobId, status: 'FAILED_RETRYABLE' }]
    });

    const attempts = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.tenantId}/ops/notifications/${seeded.notificationJobId}/attempts`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(attempts.statusCode).toBe(200);
    expect(attempts.json<{ attempts: Array<{ provider: string }> }>()).toMatchObject({
      attempts: [{ provider: 'twilio_sms' }]
    });

    const dlq = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.tenantId}/ops/dlq/notifications?limit=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(dlq.statusCode).toBe(200);
    expect(dlq.json<{ jobs: Array<{ id: string | null }> }>().jobs).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: seeded.dlqJobId })])
    );

    const replay = await server.inject({
      method: 'POST',
      url: `/tenants/${ctx.tenantId}/ops/dlq/notifications/${seeded.dlqJobId}/replay`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ replayed: true });

    const replayedPrimaryJobs = await ctx.notificationsPrimary.getJobs(['wait', 'delayed'], 0, 10);
    expect(replayedPrimaryJobs.map((job) => job.data)).toEqual(
      expect.arrayContaining([expect.objectContaining({ job_id: seeded.notificationJobId })])
    );

    await server.close();
  });

  it('requires authentication for ops routes', async () => {
    ctx = await createContext();
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: `/tenants/${ctx.tenantId}/ops/summary`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorEnvelope>().error_code).toBe('auth_missing_token');

    await server.close();
  });
});
