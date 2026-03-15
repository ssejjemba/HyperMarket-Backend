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
  expect(body.message).toBe('Template route not implemented');
};

describe('TMP routes scaffold', () => {
  it.each([
    ['GET', '/templates'],
    ['GET', '/templates/basic-commerce/versions'],
    ['GET', '/templates/basic-commerce/versions/v1/schema']
  ])('registers %s %s and returns the shared error envelope', async (method, url) => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method, url });

    expect(res.statusCode).toBe(501);
    expectErrorEnvelope(res.json<ErrorEnvelope>());

    await server.close();
  });
});
