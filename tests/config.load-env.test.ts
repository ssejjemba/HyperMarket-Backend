import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const applyBaseEnv = () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://hypermarket:hypermarket@localhost:5432/hypermarket';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters';
  process.env.JWT_ISSUER = 'test-suite';
  process.env.TWILIO_ACCOUNT_SID = 'ACtestaccountsid000000000000000000';
  process.env.TWILIO_AUTH_TOKEN = 'test-twilio-auth-token';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtestservicesid000000000000000000';
  process.env.PLATFORM_ROOT_DOMAIN = 'platform.ug';
  process.env.NOT_DEFAULT_PROVIDER = 'twilio_sms';
  process.env.NOT_DEFAULT_CHANNEL = 'sms';
  process.env.TWILIO_SMS_FROM = '+256700000000';
  process.env.PAYMENT_DEFAULT_PROVIDER = 'flutterwave';
  process.env.FLW_BASE_URL = 'https://api.flutterwave.com';
  process.env.FLW_DEFAULT_NETWORK = 'MTN';
};

describe('loadEnv feature validation', () => {
  afterEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it('fails loudly when flutterwave is enabled without secrets', async () => {
    applyBaseEnv();
    delete process.env.FLW_SECRET_KEY;
    delete process.env.FLW_WEBHOOK_SECRET_HASH;

    const { loadEnv } = await import('../packages/core/src/config/loadEnv');

    expect(() => loadEnv()).toThrowError(
      /FLW_SECRET_KEY: Required when PAYMENT_DEFAULT_PROVIDER=flutterwave/
    );
  });

  it('allows test mode to omit flutterwave secrets', async () => {
    applyBaseEnv();
    process.env.NODE_ENV = 'test';
    delete process.env.FLW_SECRET_KEY;
    delete process.env.FLW_WEBHOOK_SECRET_HASH;

    const { loadEnv } = await import('../packages/core/src/config/loadEnv');

    expect(() => loadEnv()).not.toThrow();
  });
});
