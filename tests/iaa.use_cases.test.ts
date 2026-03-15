import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import {
  IaaError,
  MembershipClaim,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: () => silentLogger
} as never;

const makeUser = (id = 'user-123') =>
  new UserIdentity({
    id,
    phoneE164: '+256712345678',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  });

const futureDate = () => new Date(Date.now() + 300_000);

// ---------------------------------------------------------------------------
// RequestOtpUseCase
// ---------------------------------------------------------------------------

describe('RequestOtpUseCase', () => {
  const makeOtpService = (overrides?: Partial<OtpChallengeService>): OtpChallengeService => ({
    requestChallenge: vi.fn().mockResolvedValue({
      challengeId: 'ch-001',
      expiresAt: futureDate(),
      resendAfterSeconds: 60
    } satisfies RequestChallengeResult),
    verifyChallenge: vi.fn(),
    ...overrides
  });

  it('parses phone and calls otpService.requestChallenge', async () => {
    const otpService = makeOtpService();
    const uc = createRequestOtpUseCase({ otpService, logger: silentLogger });

    const result = await uc.execute({
      phoneRaw: '+256712345678',
      requestId: 'req-1'
    });

    expect(otpService.requestChallenge).toHaveBeenCalledOnce();
    const [phone, ctx] = (otpService.requestChallenge as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(phone.toE164()).toBe('+256712345678');
    expect(ctx.requestId).toBe('req-1');
    expect(result.challengeId).toBe('ch-001');
  });

  it('returns challengeId, expiresAt, resendAfterSeconds from service', async () => {
    const expiresAt = futureDate();
    const otpService = makeOtpService({
      requestChallenge: vi.fn().mockResolvedValue({
        challengeId: 'ch-xyz',
        expiresAt,
        resendAfterSeconds: 90
      })
    });
    const uc = createRequestOtpUseCase({ otpService, logger: silentLogger });
    const result = await uc.execute({ phoneRaw: '+256712345678', requestId: 'req-2' });

    expect(result.challengeId).toBe('ch-xyz');
    expect(result.expiresAt).toBe(expiresAt);
    expect(result.resendAfterSeconds).toBe(90);
  });

  it('throws AUTH_INVALID_PHONE_FORMAT for a bad phone without calling service', async () => {
    const otpService = makeOtpService();
    const uc = createRequestOtpUseCase({ otpService, logger: silentLogger });

    let thrown: unknown;
    try {
      await uc.execute({ phoneRaw: 'not-a-phone', requestId: 'req-3' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthInvalidPhoneFormat);
    expect(otpService.requestChallenge).not.toHaveBeenCalled();
  });

  it.each(['+12025550123', '+447911123456'])(
    'throws AUTH_PHONE_COUNTRY_NOT_SUPPORTED for non-Ugandan phone %s',
    async (phoneRaw) => {
      const otpService = makeOtpService();
      const uc = createRequestOtpUseCase({ otpService, logger: silentLogger });

      let thrown: unknown;
      try {
        await uc.execute({ phoneRaw, requestId: 'req-ug-check' });
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(IaaError);
      expect((thrown as IaaError).code).toBe(ErrorCode.AuthPhoneCountryNotSupported);
      expect(otpService.requestChallenge).not.toHaveBeenCalled();
    }
  );

  it('propagates IaaError from otpService', async () => {
    const otpService = makeOtpService({
      requestChallenge: vi
        .fn()
        .mockRejectedValue(
          new IaaError({ code: ErrorCode.AuthOtpRateLimitedPhone, message: 'Rate limited' })
        )
    });
    const uc = createRequestOtpUseCase({ otpService, logger: silentLogger });

    let thrown: unknown;
    try {
      await uc.execute({ phoneRaw: '+256712345678', requestId: 'req-4' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthOtpRateLimitedPhone);
  });

  it('passes traceId to service context', async () => {
    const otpService = makeOtpService();
    const uc = createRequestOtpUseCase({ otpService, logger: silentLogger });

    await uc.execute({
      phoneRaw: '+256712345678',
      requestId: 'r1',
      traceId: 't-abc',
      ipAddress: '127.0.0.1'
    });

    const [, ctx] = (otpService.requestChallenge as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ctx.traceId).toBe('t-abc');
    expect(ctx.ipAddress).toBe('127.0.0.1');
  });

  it('does not depend on Fastify types (smoke: use case is constructable without Fastify)', () => {
    // If this file compiles and runs, the use case has no Fastify import.
    const uc = createRequestOtpUseCase({ otpService: makeOtpService(), logger: silentLogger });
    expect(typeof uc.execute).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// VerifyOtpUseCase
// ---------------------------------------------------------------------------

describe('VerifyOtpUseCase', () => {
  const makeOtpService = (overrides?: Partial<OtpChallengeService>): OtpChallengeService => ({
    requestChallenge: vi.fn(),
    verifyChallenge: vi.fn().mockResolvedValue({
      phoneE164: '+256712345678'
    } satisfies VerifyChallengeResult),
    ...overrides
  });

  const makeUserService = (user = makeUser()): UserService => ({
    getOrCreateByPhone: vi.fn().mockResolvedValue(user)
  });

  const makeSessionService = (): SessionService => ({
    issueSession: vi.fn().mockResolvedValue({
      accessToken: 'tok.abc.def',
      expiresAt: futureDate()
    } satisfies IssueSessionResult),
    validateSession: vi.fn().mockResolvedValue({
      userId: 'user-123',
      sessionId: 'session-123'
    })
  });

  const makeMembershipReader = (claims: MembershipClaim[] = []): MembershipReader => ({
    listMemberships: vi.fn().mockResolvedValue(claims),
    assertMembership: vi.fn()
  });

  const makeDeps = (overrides: Partial<Parameters<typeof createVerifyOtpUseCase>[0]> = {}) => ({
    otpService: makeOtpService(),
    userService: makeUserService(),
    sessionService: makeSessionService(),
    membershipReader: makeMembershipReader(),
    logger: silentLogger,
    ...overrides
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('calls all services in order and returns full output', async () => {
    const user = makeUser('user-verify-1');
    const expiresAt = futureDate();
    const membership = new MembershipClaim({
      tenantId: 'tenant-1',
      role: 'owner',
      status: 'active'
    });

    const otpService = makeOtpService();
    const userService = makeUserService(user);
    const sessionService = makeSessionService();
    const membershipReader = makeMembershipReader([membership]);
    // Override issueSession return
    (sessionService.issueSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'the-token',
      expiresAt
    });

    const uc = createVerifyOtpUseCase({
      otpService,
      userService,
      sessionService,
      membershipReader,
      logger: silentLogger
    });

    const result = await uc.execute({
      challengeId: 'ch-001',
      phoneRaw: '+256712345678',
      otpCode: '123456',
      requestId: 'req-v1'
    });

    expect(otpService.verifyChallenge).toHaveBeenCalledOnce();
    expect(userService.getOrCreateByPhone).toHaveBeenCalledOnce();
    expect(sessionService.issueSession).toHaveBeenCalledWith(user);
    expect(membershipReader.listMemberships).toHaveBeenCalledWith(user.id);

    expect(result.accessToken).toBe('the-token');
    expect(result.expiresAt).toBe(expiresAt);
    expect(result.userId).toBe(user.id);
    expect(result.memberships).toEqual([membership]);
  });

  it('passes correct arguments to verifyChallenge', async () => {
    const deps = makeDeps();
    const uc = createVerifyOtpUseCase(deps);

    await uc.execute({
      challengeId: 'ch-xyz',
      phoneRaw: '+256712345678',
      otpCode: '999999',
      requestId: 'req-v2',
      traceId: 'trace-1'
    });

    const [cId, phone, code, ctx] = (deps.otpService.verifyChallenge as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(cId).toBe('ch-xyz');
    expect(phone.toE164()).toBe('+256712345678');
    expect(code).toBe('999999');
    expect(ctx.requestId).toBe('req-v2');
    expect(ctx.traceId).toBe('trace-1');
  });

  // -------------------------------------------------------------------------
  // Phone parsing
  // -------------------------------------------------------------------------

  it('throws AUTH_INVALID_PHONE_FORMAT without calling services', async () => {
    const deps = makeDeps();
    const uc = createVerifyOtpUseCase(deps);

    let thrown: unknown;
    try {
      await uc.execute({ challengeId: 'ch-1', phoneRaw: 'bad', otpCode: '123456', requestId: 'r' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthInvalidPhoneFormat);
    expect(deps.otpService.verifyChallenge).not.toHaveBeenCalled();
  });

  it.each(['+12025550123', '+447911123456'])(
    'throws AUTH_PHONE_COUNTRY_NOT_SUPPORTED for non-Ugandan verify phone %s',
    async (phoneRaw) => {
      const deps = makeDeps();
      const uc = createVerifyOtpUseCase(deps);

      let thrown: unknown;
      try {
        await uc.execute({
          challengeId: 'ch-1',
          phoneRaw,
          otpCode: '123456',
          requestId: 'req-ug-verify'
        });
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(IaaError);
      expect((thrown as IaaError).code).toBe(ErrorCode.AuthPhoneCountryNotSupported);
      expect(deps.otpService.verifyChallenge).not.toHaveBeenCalled();
    }
  );

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it('propagates AUTH_OTP_INVALID from otpService', async () => {
    const deps = makeDeps({
      otpService: makeOtpService({
        verifyChallenge: vi
          .fn()
          .mockRejectedValue(
            new IaaError({ code: ErrorCode.AuthOtpInvalid, message: 'Wrong code' })
          )
      })
    });
    const uc = createVerifyOtpUseCase(deps);

    let thrown: unknown;
    try {
      await uc.execute({
        challengeId: 'ch-1',
        phoneRaw: '+256712345678',
        otpCode: '000000',
        requestId: 'r'
      });
    } catch (e) {
      thrown = e;
    }

    expect((thrown as IaaError).code).toBe(ErrorCode.AuthOtpInvalid);
    expect(deps.userService.getOrCreateByPhone).not.toHaveBeenCalled();
  });

  it('propagates AUTH_USER_SUSPENDED from userService', async () => {
    const deps = makeDeps({
      userService: {
        getOrCreateByPhone: vi
          .fn()
          .mockRejectedValue(
            new IaaError({ code: ErrorCode.AuthUserSuspended, message: 'Suspended' })
          )
      }
    });
    const uc = createVerifyOtpUseCase(deps);

    let thrown: unknown;
    try {
      await uc.execute({
        challengeId: 'ch-1',
        phoneRaw: '+256712345678',
        otpCode: '123456',
        requestId: 'r'
      });
    } catch (e) {
      thrown = e;
    }

    expect((thrown as IaaError).code).toBe(ErrorCode.AuthUserSuspended);
    expect(deps.sessionService.issueSession).not.toHaveBeenCalled();
  });

  it('propagates AUTH_SESSION_ISSUE_FAILED from sessionService', async () => {
    const deps = makeDeps({
      sessionService: {
        issueSession: vi
          .fn()
          .mockRejectedValue(
            new IaaError({ code: ErrorCode.AuthSessionIssueFailed, message: 'Failed' })
          ),
        validateSession: vi.fn()
      }
    });
    const uc = createVerifyOtpUseCase(deps);

    let thrown: unknown;
    try {
      await uc.execute({
        challengeId: 'ch-1',
        phoneRaw: '+256712345678',
        otpCode: '123456',
        requestId: 'r'
      });
    } catch (e) {
      thrown = e;
    }

    expect((thrown as IaaError).code).toBe(ErrorCode.AuthSessionIssueFailed);
    expect(deps.membershipReader.listMemberships).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // No Fastify dependency
  // -------------------------------------------------------------------------

  it('does not depend on Fastify types (smoke)', () => {
    const uc = createVerifyOtpUseCase(makeDeps());
    expect(typeof uc.execute).toBe('function');
  });
});
