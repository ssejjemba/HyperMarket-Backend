import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';

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
  it.each([
    ['POST', '/tenants', { name: 'Acme' }],
    ['GET', '/tenants', undefined],
    ['GET', '/tenants/00000000-0000-0000-0000-000000000001', undefined],
    ['GET', '/tenants/00000000-0000-0000-0000-000000000001/settings', undefined],
    ['PATCH', '/tenants/00000000-0000-0000-0000-000000000001/settings', { theme: 'default' }],
    ['GET', '/tenants/00000000-0000-0000-0000-000000000001/memberships', undefined],
    [
      'POST',
      '/tenants/00000000-0000-0000-0000-000000000001/memberships/revoke',
      { user_id: '00000000-0000-0000-0000-000000000002' }
    ]
  ])('registers %s %s and returns the shared error envelope', async (method, url, payload) => {
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
  });
});
