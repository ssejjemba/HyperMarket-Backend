import net from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '@hypermarket/core/config/loadEnv';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';

import { buildServer } from '../apps/api/src/server';

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
  otpSecret: 'test-otp-secret-minimum-32-characters',
  otpTtlSeconds: 300,
  sessionTtlSeconds: 3600,
  enableDevRoutes: false
};

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('server health routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>> | undefined;
  let createConnectionSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(async () => {
    createConnectionSpy?.mockRestore();
    createConnectionSpy = undefined;
    if (ctx !== undefined) {
      await ctx.destroy();
    }
    ctx = undefined;
  });

  it('returns ready when database and redis checks pass', async () => {
    ctx = await createTestContext();
    const socket = {
      setTimeout: vi.fn(),
      on: vi.fn(function (
        this: Record<string, unknown>,
        event: string,
        handler: (...args: unknown[]) => void
      ) {
        if (event === 'connect') {
          handler();
        }
        if (event === 'data') {
          handler(Buffer.from('+PONG\r\n'));
        }
        return this;
      }),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      removeAllListeners: vi.fn()
    };
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockReturnValue(socket as never);
    const server = buildServer({
      config: { ...TEST_CONFIG, databaseUrl: ctx.config.databaseUrl }
    });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/health/ready'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      request_id: expect.any(String),
      checks: {
        database: true,
        redis: true
      }
    });

    await server.close();
    expect(createConnectionSpy).toHaveBeenCalled();
  });

  it('returns degraded when redis is unavailable', async () => {
    ctx = await createTestContext();
    const socket = {
      setTimeout: vi.fn(),
      on: vi.fn(function (
        this: Record<string, unknown>,
        event: string,
        handler: (...args: unknown[]) => void
      ) {
        if (event === 'error') {
          handler(new Error('redis down'));
        }
        return this;
      }),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      removeAllListeners: vi.fn()
    };
    createConnectionSpy = vi.spyOn(net, 'createConnection').mockReturnValue(socket as never);
    const server = buildServer({
      config: { ...TEST_CONFIG, databaseUrl: ctx.config.databaseUrl }
    });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/health/ready'
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'degraded',
      request_id: expect.any(String),
      checks: {
        database: true,
        redis: false
      }
    });

    await server.close();
  });
});
