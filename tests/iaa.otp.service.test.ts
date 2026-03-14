import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { IaaError } from '@hypermarket/modules/iaa';
import { createOtpChallengeRepoPg } from '@hypermarket/modules/iaa/persistence';
import { createOtpSenderDevAdapter } from '@hypermarket/modules/iaa/otp-sender';
import { createOtpChallengeService } from '@hypermarket/modules/iaa/otp-service';
import { OtpChallengePolicy } from '@hypermarket/modules/iaa';
import { PhoneNumber } from '@hypermarket/modules/iaa';

import type { OtpChallengeService } from '@hypermarket/modules/iaa/otp-service';
import type { OtpChallengeRepository } from '@hypermarket/modules/iaa/persistence';

// ---------------------------------------------------------------------------
// Suite guard
// ---------------------------------------------------------------------------

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PHONE = PhoneNumber.parse('+256712345678');
const OTP_SECRET = 'test-secret-do-not-use-in-prod';
const CTX = { requestId: 'req-test', traceId: 'trace-test' };

const POLICY = new OtpChallengePolicy({
  challengeTtlSeconds: 300,
  resendCooldownSeconds: 60,
  maxAttempts: 3
});

/** Silent pino-compatible logger for tests. */
const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => silentLogger
} as never;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the plain OTP code by reversing the HMAC.
 * Since we control the secret in tests, we brute-force the 6-digit space.
 * Returns the code string if found, throws if not.
 */
import crypto from 'node:crypto';
const recoverCode = (codeHash: string, secret: string): string => {
  for (let i = 100_000; i < 1_000_000; i++) {
    const h = crypto.createHmac('sha256', secret).update(String(i)).digest('hex');
    if (h === codeHash) return String(i);
  }
  throw new Error('Could not recover OTP code from hash — secret mismatch?');
};

const expectIaaError = (fn: () => Promise<unknown>, code: ErrorCode): Promise<void> =>
  fn().then(
    () => {
      throw new Error(`Expected IaaError(${code}) but no error was thrown`);
    },
    (err: unknown) => {
      expect(err).toBeInstanceOf(IaaError);
      expect((err as IaaError).code).toBe(code);
    }
  );

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('OtpChallengeService — integration', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let repo: OtpChallengeRepository;
  let service: OtpChallengeService;

  beforeEach(async () => {
    ctx = await createTestContext();
    repo = createOtpChallengeRepoPg(ctx.db);
    await ctx.db.deleteFrom('auth_otps').execute();

    service = createOtpChallengeService({
      repo,
      sender: createOtpSenderDevAdapter({
        mode: 'test',
        behavior: { outcome: 'sent' }
      }),
      policy: POLICY,
      otpSecret: OTP_SECRET,
      logger: silentLogger
    });
  });

  afterEach(async () => {
    await ctx.destroy();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('requestChallenge creates a challenge and returns expected fields', async () => {
    const result = await service.requestChallenge(PHONE, CTX);

    expect(result.challengeId).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.resendAfterSeconds).toBe(POLICY.resendCooldownSeconds);
  });

  it('verifyChallenge succeeds with correct code and transitions to CONSUMED', async () => {
    const { challengeId } = await service.requestChallenge(PHONE, CTX);

    const challenge = await repo.getChallengeById(challengeId);
    const code = recoverCode(challenge!.codeHash, OTP_SECRET);

    const verifyResult = await service.verifyChallenge(challengeId, PHONE, code, CTX);
    expect(verifyResult.phoneE164).toBe(PHONE.toE164());

    const consumed = await repo.getChallengeById(challengeId);
    expect(consumed!.status).toBe('CONSUMED');
  });

  // -------------------------------------------------------------------------
  // Invalid code — attempts and locking
  // -------------------------------------------------------------------------

  it('wrong code increments attempt_count in the database', async () => {
    const { challengeId } = await service.requestChallenge(PHONE, CTX);

    await expectIaaError(
      () => service.verifyChallenge(challengeId, PHONE, '000000', CTX),
      ErrorCode.AuthOtpInvalid
    );

    const challenge = await repo.getChallengeById(challengeId);
    expect(challenge!.attemptCount).toBe(1);
    expect(challenge!.status).toBe('ACTIVE');
  });

  it('AUTH_OTP_INVALID error carries remainingAttempts in details', async () => {
    const { challengeId } = await service.requestChallenge(PHONE, CTX);

    let thrown: unknown;
    try {
      await service.verifyChallenge(challengeId, PHONE, '000000', CTX);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).details?.['remainingAttempts']).toBe(POLICY.maxAttempts - 1);
  });

  it('reaching maxAttempts locks the challenge in the database', async () => {
    const { challengeId } = await service.requestChallenge(PHONE, CTX);

    // All maxAttempts wrong guesses throw AUTH_OTP_INVALID — the last one
    // transitions status to LOCKED but still returns the OTP-specific error.
    for (let i = 0; i < POLICY.maxAttempts; i++) {
      await expectIaaError(
        () => service.verifyChallenge(challengeId, PHONE, '000000', CTX),
        ErrorCode.AuthOtpInvalid
      );
    }

    const challenge = await repo.getChallengeById(challengeId);
    expect(challenge!.status).toBe('LOCKED');
  });

  it('locked challenge throws AUTH_CHALLENGE_LOCKED on any subsequent verify', async () => {
    const { challengeId } = await service.requestChallenge(PHONE, CTX);

    // exhaust attempts
    for (let i = 0; i < POLICY.maxAttempts; i++) {
      await service.verifyChallenge(challengeId, PHONE, '000000', CTX).catch(() => undefined);
    }

    // additional attempt after lock
    await expectIaaError(
      () => service.verifyChallenge(challengeId, PHONE, '000000', CTX),
      ErrorCode.AuthChallengeLocked
    );
  });

  // -------------------------------------------------------------------------
  // Expired challenge
  // -------------------------------------------------------------------------

  it('expired challenge throws AUTH_CHALLENGE_EXPIRED', async () => {
    // Create a challenge that is already expired by inserting directly
    const expiredAt = new Date(Date.now() - 1000);
    const expired = await repo.createChallenge({
      phoneE164: PHONE.toE164(),
      codeHash: 'any',
      expiresAt: expiredAt,
      maxAttempts: POLICY.maxAttempts,
      lastSentAt: new Date()
    });

    await expectIaaError(
      () => service.verifyChallenge(expired.id, PHONE, '123456', CTX),
      ErrorCode.AuthChallengeExpired
    );
  });

  // -------------------------------------------------------------------------
  // Phone mismatch
  // -------------------------------------------------------------------------

  it('phone mismatch throws AUTH_CHALLENGE_PHONE_MISMATCH', async () => {
    const { challengeId } = await service.requestChallenge(PHONE, CTX);
    const differentPhone = PhoneNumber.parse('+447911123456');

    await expectIaaError(
      () => service.verifyChallenge(challengeId, differentPhone, '123456', CTX),
      ErrorCode.AuthChallengePhoneMismatch
    );
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  it('unknown challengeId throws AUTH_CHALLENGE_NOT_FOUND', async () => {
    await expectIaaError(
      () => service.verifyChallenge('00000000-0000-0000-0000-000000000000', PHONE, '123456', CTX),
      ErrorCode.AuthChallengeNotFound
    );
  });

  // -------------------------------------------------------------------------
  // Send failure
  // -------------------------------------------------------------------------

  it('provider failure throws AUTH_PROVIDER_UNAVAILABLE and marks challenge SEND_FAILED', async () => {
    const failingService = createOtpChallengeService({
      repo,
      sender: createOtpSenderDevAdapter({
        mode: 'test',
        behavior: { outcome: 'failed', failureCategory: 'provider_down' }
      }),
      policy: POLICY,
      otpSecret: OTP_SECRET,
      logger: silentLogger
    });

    let challengeId: string | undefined;

    let thrown: unknown;
    try {
      const result = await failingService.requestChallenge(PHONE, CTX);
      challengeId = result.challengeId;
    } catch (e) {
      thrown = e;
      // We need to find the created challenge even though the service threw —
      // look up the most recently created row for this phone.
      const rows = await ctx.db
        .selectFrom('auth_otps')
        .select(['id', 'status'])
        .where('phone_e164', '=', PHONE.toE164())
        .orderBy('created_at', 'desc')
        .limit(1)
        .execute();
      if (rows[0] !== undefined) {
        challengeId = rows[0].id;
      }
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthProviderUnavailable);

    if (challengeId !== undefined) {
      const challenge = await repo.getChallengeById(challengeId);
      expect(challenge!.status).toBe('SEND_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // Double-consume
  // -------------------------------------------------------------------------

  it('consuming a challenge twice throws AUTH_CHALLENGE_CONSUMED', async () => {
    const { challengeId } = await service.requestChallenge(PHONE, CTX);
    const challenge = await repo.getChallengeById(challengeId);
    const code = recoverCode(challenge!.codeHash, OTP_SECRET);

    await service.verifyChallenge(challengeId, PHONE, code, CTX);

    await expectIaaError(
      () => service.verifyChallenge(challengeId, PHONE, code, CTX),
      ErrorCode.AuthChallengeConsumed
    );
  });
});
