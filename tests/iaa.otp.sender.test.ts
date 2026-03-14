import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { otpSink } from '@hypermarket/core/dev/otpSink';
import { createOtpSenderDevAdapter } from '@hypermarket/modules/iaa/otp-sender';
import type { OtpSendCorrelation } from '@hypermarket/modules/iaa/otp-sender';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE = '+256712345678';
const CODE = '123456'; // never should appear in any log/result
const CORRELATION: OtpSendCorrelation = {
  requestId: 'req-aaa',
  challengeId: 'chall-bbb',
  expiresAt: new Date('2026-03-15T12:00:00.000Z'),
  traceId: 'trace-ccc'
};

// ---------------------------------------------------------------------------
// Test-mode adapter
// ---------------------------------------------------------------------------

describe('OtpSenderDevAdapter — test mode', () => {
  it('returns SENT when behavior is { outcome: "sent" }', async () => {
    const adapter = createOtpSenderDevAdapter({
      mode: 'test',
      behavior: { outcome: 'sent' }
    });

    const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(result.status).toBe('SENT');
    expect(result.provider).toBe('dev');
  });

  it('returns providerMessageId when supplied in SENT behavior', async () => {
    const adapter = createOtpSenderDevAdapter({
      mode: 'test',
      behavior: { outcome: 'sent', providerMessageId: 'msg-xyz' }
    });

    const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(result.status).toBe('SENT');
    expect(result.providerMessageId).toBe('msg-xyz');
  });

  it('returns FAILED with failureCategory when behavior is { outcome: "failed" }', async () => {
    const adapter = createOtpSenderDevAdapter({
      mode: 'test',
      behavior: { outcome: 'failed', failureCategory: 'timeout' }
    });

    const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(result.status).toBe('FAILED');
    expect(result.failureCategory).toBe('timeout');
    expect(result.provider).toBe('dev');
  });

  it.each<'timeout' | 'auth' | 'invalid_number' | 'provider_down'>([
    'timeout',
    'auth',
    'invalid_number',
    'provider_down'
  ])('passes failureCategory "%s" through unchanged', async (category) => {
    const adapter = createOtpSenderDevAdapter({
      mode: 'test',
      behavior: { outcome: 'failed', failureCategory: category }
    });

    const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);
    expect(result.failureCategory).toBe(category);
  });

  it('is synchronously deterministic — same call returns same shape', async () => {
    const adapter = createOtpSenderDevAdapter({
      mode: 'test',
      behavior: { outcome: 'sent', providerMessageId: 'id-1' }
    });

    const a = await adapter.sendOtp(PHONE, CODE, CORRELATION);
    const b = await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(a).toEqual(b);
  });

  it('does not include otpCode in the returned result', async () => {
    const adapter = createOtpSenderDevAdapter({
      mode: 'test',
      behavior: { outcome: 'sent' }
    });

    const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);
    const serialised = JSON.stringify(result);

    expect(serialised).not.toContain(CODE);
  });
});

// ---------------------------------------------------------------------------
// Dev-mode adapter
// ---------------------------------------------------------------------------

describe('OtpSenderDevAdapter — dev mode', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableDevRoutes = process.env.ENABLE_DEV_ROUTES;

  const makeLogger = () => {
    const calls: unknown[] = [];
    const logger = {
      info: (...args: unknown[]) => calls.push(args),
      child: () => logger
    } as never;
    return { logger, calls };
  };

  const resetEnv = () => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalEnableDevRoutes === undefined) {
      delete process.env.ENABLE_DEV_ROUTES;
    } else {
      process.env.ENABLE_DEV_ROUTES = originalEnableDevRoutes;
    }
  };

  beforeEach(() => {
    otpSink.clear();
    resetEnv();
  });

  afterEach(() => {
    otpSink.clear();
    resetEnv();
  });

  it('returns SENT', async () => {
    const { logger } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(result.status).toBe('SENT');
    expect(result.provider).toBe('dev');
  });

  it('writes the OTP to the dev sink in development mode', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_DEV_ROUTES;

    const { logger } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(otpSink.get(CORRELATION.challengeId)).toEqual({
      otpCode: CODE,
      expiresAt: CORRELATION.expiresAt
    });
  });

  it('writes the OTP to the dev sink when ENABLE_DEV_ROUTES=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEV_ROUTES = 'true';

    const { logger } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(otpSink.get(CORRELATION.challengeId)).toEqual({
      otpCode: CODE,
      expiresAt: CORRELATION.expiresAt
    });
  });

  it('does not write the OTP to the dev sink outside local dev mode', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEV_ROUTES;

    const { logger } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(otpSink.get(CORRELATION.challengeId)).toBeNull();
  });

  it('emits exactly one structured log entry', async () => {
    const { logger, calls } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(calls).toHaveLength(1);
  });

  it('log payload contains maskedPhone — not the raw number', async () => {
    const { logger, calls } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    const [payload] = calls[0] as [Record<string, unknown>];
    expect(payload['maskedPhone']).toBe('+********5678'); // +256712345678: 12 digits → mask 8
    expect(JSON.stringify(payload)).not.toContain(PHONE);
  });

  it('log payload contains correlation fields', async () => {
    const { logger, calls } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    const [payload] = calls[0] as [Record<string, unknown>];
    expect(payload['challengeId']).toBe(CORRELATION.challengeId);
    expect(payload['requestId']).toBe(CORRELATION.requestId);
    expect(payload['traceId']).toBe(CORRELATION.traceId);
  });

  it('log payload NEVER contains otpCode', async () => {
    const { logger, calls } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    const serialised = JSON.stringify(calls);
    expect(serialised).not.toContain(CODE);
  });

  it('omits traceId from log when not supplied in correlation', async () => {
    const { logger, calls } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    await adapter.sendOtp(PHONE, CODE, {
      requestId: 'req-1',
      challengeId: 'chall-1'
      // no traceId
    });

    const [payload] = calls[0] as [Record<string, unknown>];
    expect(Object.prototype.hasOwnProperty.call(payload, 'traceId')).toBe(false);
  });

  it('log payload NEVER contains the raw phone number (redaction)', async () => {
    const { logger, calls } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    // Use a distinct number so we can search cleanly
    const phone = '+447911123456';
    await adapter.sendOtp(phone, CODE, CORRELATION);

    const serialised = JSON.stringify(calls);
    expect(serialised).not.toContain(phone);
    expect(serialised).toContain('*'); // masked form is present
  });

  it('providerMessageId is absent from SENT result (dev has no message ID)', async () => {
    const { logger } = makeLogger();
    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });

    const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);

    expect(result.providerMessageId).toBeUndefined();
    expect(result.failureCategory).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Redaction invariant — both modes
// ---------------------------------------------------------------------------

describe('OtpSenderDevAdapter — otpCode redaction invariant', () => {
  it('test mode: result does not contain otpCode for any failure category', async () => {
    const categories = ['timeout', 'auth', 'invalid_number', 'provider_down'] as const;
    for (const cat of categories) {
      const adapter = createOtpSenderDevAdapter({
        mode: 'test',
        behavior: { outcome: 'failed', failureCategory: cat }
      });
      const result = await adapter.sendOtp(PHONE, CODE, CORRELATION);
      expect(JSON.stringify(result)).not.toContain(CODE);
    }
  });

  it('vi.spyOn cannot observe otpCode being passed to logger in dev mode', async () => {
    const logger = {
      info: vi.fn()
    } as never;

    const adapter = createOtpSenderDevAdapter({ mode: 'dev', logger });
    await adapter.sendOtp(PHONE, CODE, CORRELATION);

    const loggedArgs = (logger as { info: ReturnType<typeof vi.fn> }).info.mock.calls.flat();
    const loggedStr = JSON.stringify(loggedArgs);
    expect(loggedStr).not.toContain(CODE);
  });
});
