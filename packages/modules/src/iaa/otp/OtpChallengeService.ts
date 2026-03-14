import crypto from 'node:crypto';

import { ErrorCode } from '@hypermarket/contracts';
import type { BaseLogger } from 'pino';

import { IaaError } from '../errors/IaaError';
import type { PhoneNumber } from '../phone/PhoneNumber';
import type { OtpChallengePolicy } from './domain/OtpChallengePolicy';
import type { OtpChallengeRepository } from './persistence/OtpChallengeRepository';
import type { OtpSender } from './integrations/OtpSender';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OtpRequestContext = {
  requestId: string;
  traceId?: string | undefined;
};

export type OtpVerifyContext = {
  requestId: string;
  traceId?: string | undefined;
};

export type RequestChallengeResult = {
  challengeId: string;
  expiresAt: Date;
  /** Seconds the caller must wait before requesting a resend. */
  resendAfterSeconds: number;
};

export type VerifyChallengeResult = {
  phoneE164: string;
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour — MVP per-phone limit window
const RATE_LIMIT_MAX_CHALLENGES = 5; // max challenges allowed in that window

/**
 * Hash an OTP code with the application secret using HMAC-SHA256.
 * The raw code is never stored or logged — only this digest.
 */
const hashCode = (code: string, secret: string): string =>
  crypto.createHmac('sha256', secret).update(code).digest('hex');

/** Generate a cryptographically random 6-digit OTP code. */
const generateCode = (): string => String(crypto.randomInt(100_000, 1_000_000));

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type OtpChallengeServiceDeps = {
  repo: OtpChallengeRepository;
  sender: OtpSender;
  policy: OtpChallengePolicy;
  otpSecret: string;
  logger: BaseLogger;
};

export type OtpChallengeService = {
  requestChallenge(phone: PhoneNumber, ctx: OtpRequestContext): Promise<RequestChallengeResult>;
  verifyChallenge(
    challengeId: string,
    phone: PhoneNumber,
    otpCode: string,
    ctx: OtpVerifyContext
  ): Promise<VerifyChallengeResult>;
};

export const createOtpChallengeService = (deps: OtpChallengeServiceDeps): OtpChallengeService => {
  const { repo, sender, policy, otpSecret, logger } = deps;

  // -------------------------------------------------------------------------
  // requestChallenge
  // -------------------------------------------------------------------------

  const requestChallenge = async (
    phone: PhoneNumber,
    ctx: OtpRequestContext
  ): Promise<RequestChallengeResult> => {
    const phoneE164 = phone.toE164();
    const maskedPhone = phone.toMasked();
    const now = new Date();

    // --- Rate-limit guard (per phone, rolling 1-hour window) ----------------
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_SECONDS * 1000);
    const recentCount = await repo.countRecentChallengesForPhone(phoneE164, windowStart);
    if (recentCount >= RATE_LIMIT_MAX_CHALLENGES) {
      logger.warn(
        { event: 'otp.request.rate_limited', maskedPhone, requestId: ctx.requestId },
        'otp: request rate limited for phone'
      );
      throw new IaaError({
        code: ErrorCode.AuthOtpRateLimitedPhone,
        message: 'Too many OTP requests for this number. Please try again later.'
      });
    }

    // --- Generate code and persist ------------------------------------------
    const code = generateCode();
    const codeHash = hashCode(code, otpSecret);
    const expiresAt = new Date(now.getTime() + policy.challengeTtlSeconds * 1000);

    const challenge = await repo.createChallenge({
      phoneE164,
      codeHash,
      expiresAt,
      maxAttempts: policy.maxAttempts,
      lastSentAt: now
    });

    logger.info(
      {
        event: 'otp.request.created',
        challengeId: challenge.id,
        maskedPhone,
        requestId: ctx.requestId
      },
      'otp: challenge created'
    );

    // --- Send via provider ---------------------------------------------------
    const delivery = await sender.sendOtp(phoneE164, code, {
      requestId: ctx.requestId,
      challengeId: challenge.id,
      traceId: ctx.traceId
    });

    if (delivery.status === 'FAILED') {
      challenge.markSendFailed();
      await repo.updateChallenge(challenge);

      logger.error(
        {
          event: 'otp.request.send_failed',
          challengeId: challenge.id,
          maskedPhone,
          failureCategory: delivery.failureCategory,
          requestId: ctx.requestId
        },
        'otp: provider failed to send OTP'
      );

      throw new IaaError({
        code: ErrorCode.AuthProviderUnavailable,
        message: 'Failed to send OTP. Please try again.'
      });
    }

    logger.info(
      {
        event: 'otp.request.sent',
        challengeId: challenge.id,
        maskedPhone,
        provider: delivery.provider,
        requestId: ctx.requestId
      },
      'otp: OTP sent successfully'
    );

    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      resendAfterSeconds: policy.resendCooldownSeconds
    };
  };

  // -------------------------------------------------------------------------
  // verifyChallenge
  // -------------------------------------------------------------------------

  const verifyChallenge = async (
    challengeId: string,
    phone: PhoneNumber,
    otpCode: string,
    ctx: OtpVerifyContext
  ): Promise<VerifyChallengeResult> => {
    const phoneE164 = phone.toE164();
    const maskedPhone = phone.toMasked();
    const now = new Date();

    // --- Load ---------------------------------------------------------------
    const challenge = await repo.getChallengeById(challengeId);
    if (challenge === null) {
      throw new IaaError({
        code: ErrorCode.AuthChallengeNotFound,
        message: 'OTP challenge not found'
      });
    }

    const logBase = { challengeId, maskedPhone, requestId: ctx.requestId };

    // --- State guards (assertActive throws the appropriate IaaError) ---------
    challenge.assertActive(now);

    // --- Phone match --------------------------------------------------------
    challenge.assertPhoneMatches(phoneE164);

    // --- Hash comparison ----------------------------------------------------
    const expectedHash = hashCode(otpCode, otpSecret);
    if (challenge.codeHash !== expectedHash) {
      challenge.recordFailedAttempt(now);
      await repo.updateChallenge(challenge);

      const remainingAttempts = challenge.maxAttempts - challenge.attemptCount;

      logger.warn(
        { ...logBase, event: 'otp.verify.invalid_code', remainingAttempts },
        'otp: invalid OTP code'
      );

      throw new IaaError({
        code: ErrorCode.AuthOtpInvalid,
        message: 'Invalid OTP code',
        details: { remainingAttempts }
      });
    }

    // --- Success ------------------------------------------------------------
    challenge.consume(now);
    await repo.updateChallenge(challenge);

    logger.info({ ...logBase, event: 'otp.verify.success' }, 'otp: challenge verified');

    return { phoneE164 };
  };

  return { requestChallenge, verifyChallenge };
};
