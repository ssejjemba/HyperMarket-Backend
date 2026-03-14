/**
 * Observability tests for the IAA module.
 *
 * Verifies that:
 * - Emitted log records contain the required stable keys (module, event_name, etc.)
 * - Secrets (raw phone, OTP code, access_token) are never present in log output
 * - Metric counters are incremented with the correct labels on success and failure
 */
import { Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';

import { ErrorCode } from '@hypermarket/contracts';
import {
  IaaError,
  UserIdentity,
  createRequestOtpUseCase,
  createVerifyOtpUseCase
} from '@hypermarket/modules/iaa';
import type {
  OtpChallengeService,
  RequestChallengeResult,
  VerifyChallengeResult
} from '@hypermarket/modules/iaa/otp-service';
import type { SessionService, IssueSessionResult } from '@hypermarket/modules/iaa';
import type { UserService } from '@hypermarket/modules/iaa';
import type { MembershipReader } from '@hypermarket/modules/iaa';
import { createInMemoryIaaMetrics } from '@hypermarket/modules/iaa/observability';

// ---------------------------------------------------------------------------
// Pino sink helper — captures log records as parsed JSON objects
// ---------------------------------------------------------------------------

type LogRecord = Record<string, unknown>;

const createLogSink = (): { logger: pino.Logger; records: LogRecord[] } => {
  const records: LogRecord[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      try {
        records.push(JSON.parse(chunk.toString()) as LogRecord);
      } catch {
        // ignore non-JSON lines (e.g. pino startup message)
      }
      cb();
    }
  });
  const logger = pino({ level: 'debug' }, stream);
  return { logger, records };
};

// ---------------------------------------------------------------------------
// Domain object helpers
// ---------------------------------------------------------------------------

const makeUser = (id = 'user-obs-001') =>
  new UserIdentity({
    id,
    phoneE164: '+256712345678',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  });

const futureDate = () => new Date(Date.now() + 300_000);

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const makeOtpService = (overrides?: Partial<OtpChallengeService>): OtpChallengeService => ({
  requestChallenge: vi.fn().mockResolvedValue({
    challengeId: 'ch-obs-001',
    expiresAt: futureDate(),
    resendAfterSeconds: 60
  } satisfies RequestChallengeResult),
  verifyChallenge: vi.fn().mockResolvedValue({
    challengeId: 'ch-obs-001'
  } satisfies VerifyChallengeResult),
  ...overrides
});

const makeUserService = (overrides?: Partial<UserService>): UserService => ({
  getOrCreateByPhone: vi.fn().mockResolvedValue(makeUser()),
  ...overrides
});

const makeSessionService = (overrides?: Partial<SessionService>): SessionService => ({
  issueSession: vi.fn().mockResolvedValue({
    accessToken: 'tok.secret.value',
    expiresAt: futureDate()
  } satisfies IssueSessionResult),
  validateSession: vi.fn().mockResolvedValue({ userId: 'user-obs-001' }),
  ...overrides
});

const makeMembershipReader = (overrides?: Partial<MembershipReader>): MembershipReader => ({
  listMemberships: vi.fn().mockResolvedValue([]),
  assertMembership: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

// ---------------------------------------------------------------------------
// RequestOtpUseCase — logging
// ---------------------------------------------------------------------------

describe('RequestOtpUseCase — structured logging', () => {
  it('emits otp_request_success log with required keys on success', async () => {
    const { logger, records } = createLogSink();
    const useCase = createRequestOtpUseCase({
      otpService: makeOtpService(),
      logger
    });

    await useCase.execute({ phoneRaw: '+256712345678', requestId: 'req-001' });

    const successRecord = records.find((r) => r['event_name'] === 'otp_request_success');
    expect(successRecord).toBeDefined();
    expect(successRecord?.['module']).toBe('iaa');
    expect(successRecord?.['outcome']).toBe('success');
    expect(successRecord?.['challenge_id']).toBe('ch-obs-001');
    expect(successRecord?.['phone_masked']).toMatch(/^\+\*+\d{4}$/);
    expect(successRecord?.['request_id']).toBe('req-001');
  });

  it('emits otp_request_start debug log with module and event_name', async () => {
    const { logger, records } = createLogSink();
    const useCase = createRequestOtpUseCase({
      otpService: makeOtpService(),
      logger
    });

    await useCase.execute({ phoneRaw: '+256712345678', requestId: 'req-002' });

    const startRecord = records.find((r) => r['event_name'] === 'otp_request_start');
    expect(startRecord).toBeDefined();
    expect(startRecord?.['module']).toBe('iaa');
    expect(startRecord?.['level']).toBeDefined(); // pino includes level
  });

  it('emits otp_request_failure log with error_code on IaaError', async () => {
    const { logger, records } = createLogSink();
    const useCase = createRequestOtpUseCase({
      otpService: makeOtpService({
        requestChallenge: vi
          .fn()
          .mockRejectedValue(
            new IaaError({ code: ErrorCode.AuthRateLimitExceeded, message: 'Rate limit hit' })
          )
      }),
      logger
    });

    await expect(
      useCase.execute({ phoneRaw: '+256712345678', requestId: 'req-003' })
    ).rejects.toThrow();

    const failRecord = records.find((r) => r['event_name'] === 'otp_request_failure');
    expect(failRecord).toBeDefined();
    expect(failRecord?.['module']).toBe('iaa');
    expect(failRecord?.['outcome']).toBe('failure');
    expect(failRecord?.['error_code']).toBe(ErrorCode.AuthRateLimitExceeded);
  });

  it('never logs raw phone number', async () => {
    const { logger, records } = createLogSink();
    const useCase = createRequestOtpUseCase({
      otpService: makeOtpService(),
      logger
    });

    await useCase.execute({ phoneRaw: '+256712345678', requestId: 'req-004' });

    const raw = JSON.stringify(records);
    expect(raw).not.toContain('+256712345678');
  });
});

// ---------------------------------------------------------------------------
// RequestOtpUseCase — metrics
// ---------------------------------------------------------------------------

describe('RequestOtpUseCase — metrics', () => {
  it('increments otpRequestTotal success on success', async () => {
    const metrics = createInMemoryIaaMetrics();
    const useCase = createRequestOtpUseCase({
      otpService: makeOtpService(),
      logger: pino({ level: 'silent' }),
      metrics
    });

    await useCase.execute({ phoneRaw: '+256712345678', requestId: 'req-005' });

    expect(metrics.otpRequestCalls).toHaveLength(1);
    expect(metrics.otpRequestCalls[0]).toEqual({ outcome: 'success' });
  });

  it('increments otpRequestTotal failure with error_code on IaaError', async () => {
    const metrics = createInMemoryIaaMetrics();
    const useCase = createRequestOtpUseCase({
      otpService: makeOtpService({
        requestChallenge: vi
          .fn()
          .mockRejectedValue(
            new IaaError({ code: ErrorCode.AuthRateLimitExceeded, message: 'Rate limit' })
          )
      }),
      logger: pino({ level: 'silent' }),
      metrics
    });

    await expect(
      useCase.execute({ phoneRaw: '+256712345678', requestId: 'req-006' })
    ).rejects.toThrow();

    expect(metrics.otpRequestCalls).toHaveLength(1);
    expect(metrics.otpRequestCalls[0]).toEqual({
      outcome: 'failure',
      error_code: ErrorCode.AuthRateLimitExceeded
    });
  });
});

// ---------------------------------------------------------------------------
// VerifyOtpUseCase — logging
// ---------------------------------------------------------------------------

describe('VerifyOtpUseCase — structured logging', () => {
  it('emits otp_verify_success with required keys', async () => {
    const { logger, records } = createLogSink();
    const useCase = createVerifyOtpUseCase({
      otpService: makeOtpService(),
      userService: makeUserService(),
      sessionService: makeSessionService(),
      membershipReader: makeMembershipReader(),
      logger
    });

    await useCase.execute({
      challengeId: 'ch-obs-001',
      phoneRaw: '+256712345678',
      otpCode: '123456',
      requestId: 'req-010'
    });

    const rec = records.find((r) => r['event_name'] === 'otp_verify_success');
    expect(rec).toBeDefined();
    expect(rec?.['module']).toBe('iaa');
    expect(rec?.['outcome']).toBe('success');
    expect(rec?.['challenge_id']).toBe('ch-obs-001');
    expect(rec?.['user_id']).toBe('user-obs-001');
    expect(rec?.['membership_count']).toBe(0);
    expect(rec?.['phone_masked']).toMatch(/^\+\*+\d{4}$/);
  });

  it('emits otp_verify_failure with error_code on IaaError', async () => {
    const { logger, records } = createLogSink();
    const useCase = createVerifyOtpUseCase({
      otpService: makeOtpService({
        verifyChallenge: vi
          .fn()
          .mockRejectedValue(new IaaError({ code: ErrorCode.AuthOtpInvalid, message: 'bad code' }))
      }),
      userService: makeUserService(),
      sessionService: makeSessionService(),
      membershipReader: makeMembershipReader(),
      logger
    });

    await expect(
      useCase.execute({
        challengeId: 'ch-obs-001',
        phoneRaw: '+256712345678',
        otpCode: '000000',
        requestId: 'req-011'
      })
    ).rejects.toThrow();

    const rec = records.find((r) => r['event_name'] === 'otp_verify_failure');
    expect(rec).toBeDefined();
    expect(rec?.['module']).toBe('iaa');
    expect(rec?.['outcome']).toBe('failure');
    expect(rec?.['error_code']).toBe(ErrorCode.AuthOtpInvalid);
  });

  it('never logs OTP code or access_token', async () => {
    const { logger, records } = createLogSink();
    const useCase = createVerifyOtpUseCase({
      otpService: makeOtpService(),
      userService: makeUserService(),
      sessionService: makeSessionService(),
      membershipReader: makeMembershipReader(),
      logger
    });

    await useCase.execute({
      challengeId: 'ch-obs-001',
      phoneRaw: '+256712345678',
      otpCode: '123456',
      requestId: 'req-012'
    });

    const raw = JSON.stringify(records);
    expect(raw).not.toContain('123456'); // OTP code
    expect(raw).not.toContain('tok.secret.value'); // access token
    expect(raw).not.toContain('+256712345678'); // raw phone
  });
});

// ---------------------------------------------------------------------------
// VerifyOtpUseCase — metrics
// ---------------------------------------------------------------------------

describe('VerifyOtpUseCase — metrics', () => {
  it('increments otpVerifyTotal success', async () => {
    const metrics = createInMemoryIaaMetrics();
    const useCase = createVerifyOtpUseCase({
      otpService: makeOtpService(),
      userService: makeUserService(),
      sessionService: makeSessionService(),
      membershipReader: makeMembershipReader(),
      logger: pino({ level: 'silent' }),
      metrics
    });

    await useCase.execute({
      challengeId: 'ch-obs-001',
      phoneRaw: '+256712345678',
      otpCode: '123456',
      requestId: 'req-013'
    });

    expect(metrics.otpVerifyCalls).toHaveLength(1);
    expect(metrics.otpVerifyCalls[0]).toEqual({ outcome: 'success' });
  });

  it('increments otpVerifyTotal failure with error_code', async () => {
    const metrics = createInMemoryIaaMetrics();
    const useCase = createVerifyOtpUseCase({
      otpService: makeOtpService({
        verifyChallenge: vi
          .fn()
          .mockRejectedValue(
            new IaaError({ code: ErrorCode.AuthChallengeExpired, message: 'expired' })
          )
      }),
      userService: makeUserService(),
      sessionService: makeSessionService(),
      membershipReader: makeMembershipReader(),
      logger: pino({ level: 'silent' }),
      metrics
    });

    await expect(
      useCase.execute({
        challengeId: 'ch-obs-001',
        phoneRaw: '+256712345678',
        otpCode: '123456',
        requestId: 'req-014'
      })
    ).rejects.toThrow();

    expect(metrics.otpVerifyCalls).toHaveLength(1);
    expect(metrics.otpVerifyCalls[0]).toEqual({
      outcome: 'failure',
      error_code: ErrorCode.AuthChallengeExpired
    });
  });
});
