import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { otpSink } from '@hypermarket/core/dev/otpSink';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';

import { buildServer } from '../apps/api/src/server';

type ErrorEnvelope = {
  request_id: string;
  error_code: string;
  message: string;
};

const TEST_CONFIG: AppConfig = {
  nodeEnv: 'production',
  databaseUrl: 'postgres://tester:tester@127.0.0.1:5432/hypermarket_test',
  redisUrl: 'redis://127.0.0.1:6379',
  port: 3000,
  logLevel: 'info',
  jwtSecret: 'test-jwt-secret-minimum-32-characters',
  jwtIssuer: 'test-suite',
  otpSecret: 'test-otp-secret-minimum-32-characters',
  otpTtlSeconds: 300,
  sessionTtlSeconds: 3600,
  enableDevRoutes: false
};

describe('dev OTP routes', () => {
  beforeEach(() => {
    otpSink.clear();
  });

  afterEach(() => {
    otpSink.clear();
  });

  it('returns the OTP for a local request when the feature is enabled', async () => {
    const server = buildServer({
      config: { ...TEST_CONFIG, enableDevRoutes: true },
      devRoutesMode: 'enabled'
    });
    await server.ready();

    otpSink.put('challenge-1', '123456', new Date('2026-03-15T10:00:00.000Z'));

    const res = await server.inject({
      method: 'GET',
      url: '/__dev/otp/challenge-1',
      remoteAddress: '127.0.0.1'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      challenge_id: 'challenge-1',
      otp_code: '123456',
      expires_at: '2026-03-15T10:00:00.000Z'
    });

    await server.close();
  });

  it('returns DEV_FEATURE_DISABLED when the route is registered as disabled', async () => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/__dev/otp/challenge-2',
      remoteAddress: '127.0.0.1'
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.DevFeatureDisabled);

    await server.close();
  });

  it('returns DEV_FORBIDDEN for non-local requests', async () => {
    const server = buildServer({
      config: { ...TEST_CONFIG, enableDevRoutes: true },
      devRoutesMode: 'enabled'
    });
    await server.ready();

    otpSink.put('challenge-3', '654321', new Date('2026-03-15T10:00:00.000Z'));

    const res = await server.inject({
      method: 'GET',
      url: '/__dev/otp/challenge-3',
      remoteAddress: '10.20.30.40'
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.DevForbidden);

    await server.close();
  });

  it('returns DEV_OTP_NOT_FOUND when no OTP exists for the challenge id', async () => {
    const server = buildServer({
      config: { ...TEST_CONFIG, enableDevRoutes: true },
      devRoutesMode: 'enabled'
    });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/__dev/otp/missing',
      remoteAddress: '::1'
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorEnvelope>().error_code).toBe(ErrorCode.DevOtpNotFound);

    await server.close();
  });
});
