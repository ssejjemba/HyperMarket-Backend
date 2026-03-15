import { ErrorCode } from '@hypermarket/contracts';
import type { BaseLogger } from 'pino';

import { IaaError } from '../errors/IaaError';
import type { PhoneNumber } from '../phone/PhoneNumber';
import type { OtpChallengePolicy } from './domain/OtpChallengePolicy';
import type { OtpRequestRateLimiter } from './integrations/OtpRequestRateLimiter';
import type { OtpVerificationProvider } from './integrations/OtpVerificationProvider';
import type { OtpChallengeRepository } from './persistence/OtpChallengeRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OtpRequestContext = {
  requestId: string;
  traceId?: string | undefined;
  ipAddress?: string | undefined;
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
// Service
// ---------------------------------------------------------------------------

export type OtpChallengeServiceDeps = {
  repo: OtpChallengeRepository;
  verificationProvider: OtpVerificationProvider;
  rateLimiter: OtpRequestRateLimiter;
  policy: OtpChallengePolicy;
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
  const { repo, verificationProvider, rateLimiter, policy, logger } = deps;

  // -------------------------------------------------------------------------
  // requestChallenge
  // -------------------------------------------------------------------------

  const requestChallenge = async (
    phone: PhoneNumber,
    ctx: OtpRequestContext
  ): Promise<RequestChallengeResult> => {
    const phoneE164 = phone.toE164();
    const maskedPhone = phone.toMasked();
    const ipAddress = ctx.ipAddress ?? 'unknown';
    const now = new Date();

    // --- Rate-limit guard (Redis-backed phone + IP counters) ----------------
    const phoneLimit = await rateLimiter.checkPhone(phoneE164);
    if (phoneLimit.allowed === false) {
      logger.warn(
        {
          event: 'otp.request.rate_limited',
          maskedPhone,
          requestId: ctx.requestId,
          retryAfterSeconds: phoneLimit.retryAfterSeconds
        },
        'otp: request rate limited for phone'
      );
      throw new IaaError({
        code: ErrorCode.AuthOtpRateLimitedPhone,
        message: 'Too many OTP requests for this number. Please try again later.',
        details: { retry_after_seconds: phoneLimit.retryAfterSeconds }
      });
    }

    const ipLimit = await rateLimiter.checkIp(ipAddress);
    if (ipLimit.allowed === false) {
      logger.warn(
        {
          event: 'otp.request.rate_limited_ip',
          maskedPhone,
          ipAddress,
          requestId: ctx.requestId,
          retryAfterSeconds: ipLimit.retryAfterSeconds
        },
        'otp: request rate limited for ip'
      );
      throw new IaaError({
        code: ErrorCode.AuthOtpRateLimitedIp,
        message: 'Too many OTP requests from this network. Please try again later.',
        details: { retry_after_seconds: ipLimit.retryAfterSeconds }
      });
    }

    // --- Persist lightweight challenge before provider call ------------------
    const expiresAt = new Date(now.getTime() + policy.challengeTtlSeconds * 1000);

    const challenge = await repo.createChallenge({
      phoneE164,
      codeHash: null,
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
    try {
      const delivery = await verificationProvider.startVerification({
        requestId: ctx.requestId,
        challengeId: challenge.id,
        phoneE164,
        expiresAt: challenge.expiresAt,
        traceId: ctx.traceId
      });

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
    } catch (error) {
      challenge.markSendFailed();
      await repo.updateChallenge(challenge);

      logger.error(
        {
          event: 'otp.request.send_failed',
          challengeId: challenge.id,
          maskedPhone,
          errorCode: IaaError.is(error) ? error.code : undefined,
          requestId: ctx.requestId
        },
        'otp: provider failed to send OTP'
      );

      if (IaaError.is(error)) {
        throw error;
      }

      throw new IaaError({
        code: ErrorCode.AuthProviderUnavailable,
        message: 'Failed to send OTP. Please try again.',
        cause: error
      });
    }

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

    // --- Provider verification ----------------------------------------------
    const verification = await verificationProvider.checkVerification({
      challengeId,
      phoneE164,
      code: otpCode,
      requestId: ctx.requestId,
      traceId: ctx.traceId
    });
    if (verification.approved === false) {
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
