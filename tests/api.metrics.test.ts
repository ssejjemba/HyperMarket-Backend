import { afterEach, describe, expect, it } from 'vitest';

import type { AppConfig } from '@hypermarket/core/config/loadEnv';

import { buildServer } from '../apps/api/src/server';

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

describe('api metrics endpoint', () => {
  let server: ReturnType<typeof buildServer> | null = null;

  afterEach(async () => {
    if (server !== null) {
      await server.close();
      server = null;
    }
  });

  it('exposes prometheus metrics text', async () => {
    server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });

    const response = await server.inject({
      method: 'GET',
      url: '/metrics'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('# HELP iaa_otp_request_total');
    expect(response.body).toContain('# HELP media_upload_token_issued_total');
  });
});
