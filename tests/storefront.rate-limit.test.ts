import net from 'node:net';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';
import { createTestContext, canConnectDatabase } from '@hypermarket/core/testkit';

import { buildServer } from '../apps/api/src/server';
import { createRedisStorefrontRateLimiter } from '../packages/modules/src/rateLimit/RedisStorefrontRateLimiter';

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
  publicOrderRateLimitMax: 1,
  publicPaymentRateLimitWindowSeconds: 60,
  publicPaymentRateLimitMax: 1,
  otpSecret: 'test-otp-secret-minimum-32-characters',
  otpTtlSeconds: 300,
  sessionTtlSeconds: 3600,
  enableDevRoutes: false
};

const canConnectRedis = async (redisUrl: string): Promise<boolean> =>
  new Promise((resolve) => {
    const target = new URL(redisUrl);
    const socket = net.createConnection({
      host: target.hostname,
      port: Number(target.port || 6379)
    });

    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.end();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });
    socket.on('data', (buffer) => {
      finish(buffer.toString('utf8').startsWith('+PONG'));
    });
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });

describe('storefront rate limiter', () => {
  let integrationEnabled = false;

  beforeAll(async () => {
    integrationEnabled =
      (await canConnectDatabase()) && (await canConnectRedis(TEST_CONFIG.redisUrl));
  });

  afterEach(() => {
    delete process.env.PUBLIC_ORDER_RATE_LIMIT_MAX;
    delete process.env.PUBLIC_PAYMENT_RATE_LIMIT_MAX;
    delete process.env.PUBLIC_ORDER_RATE_LIMIT_WINDOW_SECONDS;
    delete process.env.PUBLIC_PAYMENT_RATE_LIMIT_WINDOW_SECONDS;
  });

  it('returns a retry decision once the limit is exceeded', async () => {
    const state = new Map<string, number>();
    const limiter = createRedisStorefrontRateLimiter(
      {
        redisUrl: 'redis://localhost:6379',
        keyPrefix: 'test',
        max: 1,
        windowSeconds: 60
      },
      {
        redis: {
          async eval(_script, _numKeys, key) {
            const current = (state.get(String(key)) ?? 0) + 1;
            state.set(String(key), current);
            return [current, 60];
          },
          async quit() {
            return 'OK';
          }
        }
      }
    );

    await expect(limiter.check('tenant:ip')).resolves.toEqual({ allowed: true });
    await expect(limiter.check('tenant:ip')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60
    });
    await expect(limiter.close()).resolves.toBeUndefined();
  });

  describe('http integration', () => {
    let ctx: Awaited<ReturnType<typeof createTestContext>>;

    beforeEach(async () => {
      if (!integrationEnabled) {
        return;
      }

      ctx = await createTestContext();
    });

    afterEach(async () => {
      if (!integrationEnabled) {
        return;
      }

      await ctx.destroy();
    });

    it('rate limits storefront order creation and sets Retry-After', async () => {
      if (!integrationEnabled) {
        return;
      }

      const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });

      const firstResponse = await server.inject({
        method: 'POST',
        url: `/storefront/${ctx.seed.tenantSlug}/orders`,
        remoteAddress: '203.0.113.10',
        headers: {
          'idempotency-key': 'order-limit-1'
        },
        payload: {
          checkout_mode: 'pay_on_delivery',
          items: [{ product_slug: 'fresh-milk', quantity: 1 }],
          customer: {},
          fulfillment: {
            type: 'pickup',
            pickup_location_label: 'Main Branch'
          }
        }
      });

      expect(firstResponse.statusCode).not.toBe(429);

      const secondResponse = await server.inject({
        method: 'POST',
        url: `/storefront/${ctx.seed.tenantSlug}/orders`,
        remoteAddress: '203.0.113.10',
        headers: {
          'idempotency-key': 'order-limit-2'
        },
        payload: {
          checkout_mode: 'pay_on_delivery',
          items: [{ product_slug: 'fresh-milk', quantity: 1 }],
          customer: {},
          fulfillment: {
            type: 'pickup',
            pickup_location_label: 'Main Branch'
          }
        }
      });

      expect(secondResponse.statusCode).toBe(429);
      expect(secondResponse.headers['retry-after']).toBeDefined();
      expect(secondResponse.json()).toMatchObject({
        error_code: ErrorCode.RateLimited
      });

      await server.close();
    });

    it('rate limits storefront payment intent creation and sets Retry-After', async () => {
      if (!integrationEnabled) {
        return;
      }

      const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });

      const firstResponse = await server.inject({
        method: 'POST',
        url: `/storefront/${ctx.seed.tenantSlug}/payments/intents`,
        remoteAddress: '203.0.113.11',
        headers: {
          'idempotency-key': 'payment-limit-1'
        },
        payload: {
          order_id: '11111111-1111-1111-1111-111111111111',
          customer_phone_e164: '+256700000000',
          network: 'MTN',
          email: 'customer@example.com'
        }
      });

      expect(firstResponse.statusCode).not.toBe(429);

      const secondResponse = await server.inject({
        method: 'POST',
        url: `/storefront/${ctx.seed.tenantSlug}/payments/intents`,
        remoteAddress: '203.0.113.11',
        headers: {
          'idempotency-key': 'payment-limit-2'
        },
        payload: {
          order_id: '11111111-1111-1111-1111-111111111111',
          customer_phone_e164: '+256700000000',
          network: 'MTN',
          email: 'customer@example.com'
        }
      });

      expect(secondResponse.statusCode).toBe(429);
      expect(secondResponse.headers['retry-after']).toBeDefined();
      expect(secondResponse.json()).toMatchObject({
        error_code: ErrorCode.RateLimited
      });

      await server.close();
    });
  });
});
