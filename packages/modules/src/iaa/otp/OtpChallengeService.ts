import { ErrorCode } from '@hypermarket/contracts';
import type { BaseLogger } from 'pino';

import { IaaError } from '../errors/IaaError';
import { logIaaEvent } from '../observability/IaaLogEvent';
import type { IaaMetrics, ProviderCallLabels } from '../observability/iaaMetrics';
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
  metrics?: IaaMetrics | undefined;
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
  const { repo, verificationProvider, rateLimiter, policy, logger, metrics } = deps;

  const toProviderFailureCategory = (
    error: unknown
  ): Exclude<ProviderCallLabels['failure_category'], undefined> => {
    if (!IaaError.is(error)) {
      return 'provider_down';
    }

    switch (error.code) {
      case ErrorCode.AuthProviderAuthFailed:
        return 'auth';
      case ErrorCode.AuthProviderRateLimited:
        return 'rate_limited';
      case ErrorCode.AuthInvalidPhoneFormat:
        return 'invalid_number';
      case ErrorCode.AuthProviderUnavailable:
      default:
        return 'provider_down';
    }
  };

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
      logIaaEvent(
        logger,
        {
          module: 'iaa',
          event_name: 'otp_request_rate_limited_phone',
          request_id: ctx.requestId,
          trace_id: ctx.traceId,
          outcome: 'failure',
          error_code: ErrorCode.AuthOtpRateLimitedPhone,
          phone_masked: maskedPhone,
          retry_after_seconds: phoneLimit.retryAfterSeconds
        },
        'otp: request rate limited for phone',
        'warn'
      );
      throw new IaaError({
        code: ErrorCode.AuthOtpRateLimitedPhone,
        message: 'Too many OTP requests for this number. Please try again later.',
        details: { retry_after_seconds: phoneLimit.retryAfterSeconds }
      });
    }

    const ipLimit = await rateLimiter.checkIp(ipAddress);
    if (ipLimit.allowed === false) {
      logIaaEvent(
        logger,
        {
          module: 'iaa',
          event_name: 'otp_request_rate_limited_ip',
          request_id: ctx.requestId,
          trace_id: ctx.traceId,
          outcome: 'failure',
          error_code: ErrorCode.AuthOtpRateLimitedIp,
          phone_masked: maskedPhone,
          ip_address: ipAddress,
          retry_after_seconds: ipLimit.retryAfterSeconds
        },
        'otp: request rate limited for ip',
        'warn'
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

    logIaaEvent(
      logger,
      {
        module: 'iaa',
        event_name: 'otp_provider_request_start',
        request_id: ctx.requestId,
        trace_id: ctx.traceId,
        challenge_id: challenge.id,
        phone_masked: maskedPhone
      },
      'otp: challenge created',
      'debug'
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
      metrics?.providerCallsTotal({ outcome: 'success' });

      logIaaEvent(
        logger,
        {
          module: 'iaa',
          event_name: 'otp_provider_request_success',
          request_id: ctx.requestId,
          trace_id: ctx.traceId,
          outcome: 'success',
          challenge_id: challenge.id,
          phone_masked: maskedPhone,
          provider: delivery.provider
        },
        'otp: OTP sent successfully'
      );
    } catch (error) {
      const failureCategory = toProviderFailureCategory(error);
      metrics?.providerCallsTotal({ outcome: 'failure', failure_category: failureCategory });
      challenge.markSendFailed();
      await repo.updateChallenge(challenge);

      logIaaEvent(
        logger,
        {
          module: 'iaa',
          event_name: 'otp_provider_request_failure',
          request_id: ctx.requestId,
          trace_id: ctx.traceId,
          outcome: 'failure',
          error_code: IaaError.is(error) ? error.code : ErrorCode.AuthProviderUnavailable,
          challenge_id: challenge.id,
          phone_masked: maskedPhone,
          failure_category: failureCategory
        },
        'otp: provider failed to send OTP',
        'error'
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

    const logBase = {
      module: 'iaa' as const,
      challenge_id: challengeId,
      phone_masked: maskedPhone,
      request_id: ctx.requestId,
      trace_id: ctx.traceId
    };

    // --- State guards (assertActive throws the appropriate IaaError) ---------
    challenge.assertActive(now);

    // --- Phone match --------------------------------------------------------
    challenge.assertPhoneMatches(phoneE164);

    // --- Provider verification ----------------------------------------------
    let verification;
    try {
      verification = await verificationProvider.checkVerification({
        challengeId,
        phoneE164,
        code: otpCode,
        requestId: ctx.requestId,
        traceId: ctx.traceId
      });
      metrics?.providerCallsTotal({ outcome: 'success' });
    } catch (error) {
      const failureCategory = toProviderFailureCategory(error);
      metrics?.providerCallsTotal({ outcome: 'failure', failure_category: failureCategory });
      logIaaEvent(
        logger,
        {
          ...logBase,
          event_name: 'otp_provider_verify_failure',
          outcome: 'failure',
          error_code: IaaError.is(error) ? error.code : ErrorCode.AuthProviderUnavailable,
          failure_category: failureCategory
        },
        'otp: provider failed during verify',
        'error'
      );
      throw error;
    }
    if (verification.approved === false) {
      challenge.recordFailedAttempt(now);
      await repo.updateChallenge(challenge);

      const remainingAttempts = challenge.maxAttempts - challenge.attemptCount;

      logIaaEvent(
        logger,
        {
          ...logBase,
          event_name: 'otp_verify_invalid_code',
          outcome: 'failure',
          error_code: ErrorCode.AuthOtpInvalid,
          remaining_attempts: remainingAttempts,
          provider: verification.provider
        },
        'otp: invalid OTP code',
        'warn'
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

    logIaaEvent(
      logger,
      {
        ...logBase,
        event_name: 'otp_verify_provider_success',
        outcome: 'success',
        provider: verification.provider
      },
      'otp: challenge verified'
    );

    return { phoneE164 };
  };

  return { requestChallenge, verifyChallenge };
};
