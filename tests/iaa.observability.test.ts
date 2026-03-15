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
  createVerifyOtpUseCase,
  OtpChallengePolicy,
  PhoneNumber,
  type OtpRequestRateLimiter,
  type OtpVerificationProvider
} from '@hypermarket/modules/iaa';
import type {
  OtpChallengeService,
  RequestChallengeResult,
  VerifyChallengeResult
} from '@hypermarket/modules/iaa/otp-service';
import { createOtpChallengeService } from '@hypermarket/modules/iaa/otp-service';
import type { SessionService, IssueSessionResult } from '@hypermarket/modules/iaa';
import type { UserService } from '@hypermarket/modules/iaa';
import type { MembershipReader } from '@hypermarket/modules/iaa';
import { createInMemoryIaaMetrics } from '@hypermarket/modules/iaa/observability';
import type { OtpChallengeRepository } from '@hypermarket/modules/iaa/persistence';

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
const OBS_PHONE = PhoneNumber.parse('+256712345678');
const OBS_POLICY = new OtpChallengePolicy({
  challengeTtlSeconds: 300,
  resendCooldownSeconds: 60,
  maxAttempts: 3,
  phoneRateLimitBurstWindowSeconds: 600,
  phoneRateLimitBurstMaxChallenges: 3,
  phoneRateLimitDailyWindowSeconds: 86_400,
  phoneRateLimitDailyMaxChallenges: 10,
  ipRateLimitWindowSeconds: 300,
  ipRateLimitMaxChallenges: 20
});

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

const makeOtpRepo = (): OtpChallengeRepository => ({
  createChallenge: vi.fn().mockResolvedValue({
    id: 'ch-obs-001',
    phoneE164: '+256712345678',
    codeHash: null,
    expiresAt: futureDate(),
    attemptCount: 0,
    maxAttempts: 3,
    status: 'ACTIVE',
    createdAt: new Date(),
    lastSentAt: new Date(),
    isExpired: () => false,
    assertActive: () => undefined,
    assertPhoneMatches: () => undefined,
    recordFailedAttempt: () => undefined,
    consume: () => undefined,
    recordSent: () => undefined,
    markSendFailed: () => undefined
  }),
  getChallengeById: vi.fn(),
  updateChallenge: vi.fn(),
  countRecentChallengesForPhone: vi.fn().mockResolvedValue(0)
});

const makeRateLimiter = (): OtpRequestRateLimiter => ({
  checkPhone: vi.fn().mockResolvedValue({ allowed: true }),
  checkIp: vi.fn().mockResolvedValue({ allowed: true })
});

const makeVerificationProvider = (
  overrides?: Partial<OtpVerificationProvider>
): OtpVerificationProvider => ({
  startVerification: vi.fn().mockResolvedValue({ provider: 'twilio' }),
  checkVerification: vi.fn().mockResolvedValue({ approved: true, provider: 'twilio' }),
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
        requestChallenge: vi.fn().mockRejectedValue(
          new IaaError({
            code: ErrorCode.AuthOtpRateLimitedPhone,
            message: 'Rate limit hit'
          })
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
    expect(failRecord?.['error_code']).toBe(ErrorCode.AuthOtpRateLimitedPhone);
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
        requestChallenge: vi.fn().mockRejectedValue(
          new IaaError({
            code: ErrorCode.AuthOtpRateLimitedPhone,
            message: 'Rate limit'
          })
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
      error_code: ErrorCode.AuthOtpRateLimitedPhone
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

// ---------------------------------------------------------------------------
// OtpChallengeService — provider metrics and structured logs
// ---------------------------------------------------------------------------

describe('OtpChallengeService — provider observability', () => {
  it('increments provider_calls_total success and logs structured provider request keys', async () => {
    const { logger, records } = createLogSink();
    const metrics = createInMemoryIaaMetrics();
    const service = createOtpChallengeService({
      repo: makeOtpRepo(),
      verificationProvider: makeVerificationProvider(),
      rateLimiter: makeRateLimiter(),
      policy: OBS_POLICY,
      logger,
      metrics
    });

    await service.requestChallenge(OBS_PHONE, {
      requestId: 'req-provider-1',
      traceId: 'trace-provider-1',
      ipAddress: '127.0.0.1'
    });

    expect(metrics.providerCallCalls).toContainEqual({ outcome: 'success' });

    const record = records.find((entry) => entry['event_name'] === 'otp_provider_request_success');
    expect(record).toBeDefined();
    expect(record?.['module']).toBe('iaa');
    expect(record?.['provider']).toBe('twilio');
    expect(record?.['phone_masked']).toMatch(/^\+\*+\d{4}$/);

    const raw = JSON.stringify(records);
    expect(raw).not.toContain('+256712345678');
    expect(raw).not.toContain('123456');
  });

  it('increments provider_calls_total failure with failure_category on provider errors', async () => {
    const metrics = createInMemoryIaaMetrics();
    const service = createOtpChallengeService({
      repo: makeOtpRepo(),
      verificationProvider: makeVerificationProvider({
        startVerification: vi.fn().mockRejectedValue(
          new IaaError({
            code: ErrorCode.AuthProviderAuthFailed,
            message: 'provider auth failed'
          })
        )
      }),
      rateLimiter: makeRateLimiter(),
      policy: OBS_POLICY,
      logger: pino({ level: 'silent' }),
      metrics
    });

    await expect(
      service.requestChallenge(OBS_PHONE, {
        requestId: 'req-provider-2',
        traceId: 'trace-provider-2',
        ipAddress: '127.0.0.1'
      })
    ).rejects.toThrow();

    expect(metrics.providerCallCalls).toContainEqual({
      outcome: 'failure',
      failure_category: 'auth'
    });
  });
});
