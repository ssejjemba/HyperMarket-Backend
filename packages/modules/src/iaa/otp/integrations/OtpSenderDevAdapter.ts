import type { BaseLogger } from 'pino';

import { otpSink } from '@hypermarket/core/dev/otpSink';

import { PhoneNumber } from '../../phone/PhoneNumber';
import type { DeliveryResult, FailureCategory, OtpSendCorrelation, OtpSender } from './OtpSender';

// ---------------------------------------------------------------------------
// Dev-mode adapter
// ---------------------------------------------------------------------------

/**
 * Structured log emitted on every send attempt.
 * `otpCode` is intentionally absent — it must never appear in logs.
 */
type SendLogPayload = {
  event: 'otp.send';
  provider: 'dev';
  maskedPhone: string;
  challengeId: string;
  requestId: string;
  traceId?: string;
};

// ---------------------------------------------------------------------------
// Test-mode behavior injection
// ---------------------------------------------------------------------------

export type TestBehavior =
  | { outcome: 'sent'; providerMessageId?: string }
  | { outcome: 'failed'; failureCategory: FailureCategory };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

type AdapterConfig =
  | {
      mode: 'dev';
      logger: BaseLogger;
    }
  | {
      mode: 'test';
      behavior: TestBehavior;
    };

/**
 * Dev / test adapter for OTP delivery.
 *
 * - **dev** mode: emits a structured log with a masked phone number and
 *   correlation fields. The `otpCode` is never included in the log payload.
 * - **test** mode: returns a deterministic result driven by an injected
 *   `TestBehavior` — no I/O, no logging.
 *
 * Neither mode sends a real SMS.
 */
export const createOtpSenderDevAdapter = (config: AdapterConfig): OtpSender => {
  const shouldWriteToSink =
    process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_ROUTES === 'true';

  const sendOtp = async (
    phoneE164: string,
    otpCode: string, // never log this value
    correlation: OtpSendCorrelation
  ): Promise<DeliveryResult> => {
    if (config.mode === 'test') {
      const { behavior } = config;
      if (behavior.outcome === 'sent') {
        return {
          status: 'SENT',
          provider: 'dev',
          providerMessageId: behavior.providerMessageId
        };
      }
      return {
        status: 'FAILED',
        provider: 'dev',
        failureCategory: behavior.failureCategory
      };
    }

    if (shouldWriteToSink) {
      otpSink.put(correlation.challengeId, otpCode, correlation.expiresAt);
    }

    // dev mode — structured log, masked phone, no otpCode
    const maskedPhone = PhoneNumber.parse(phoneE164).toMasked();
    const payload: SendLogPayload = {
      event: 'otp.send',
      provider: 'dev',
      maskedPhone,
      challengeId: correlation.challengeId,
      requestId: correlation.requestId,
      ...(correlation.traceId !== undefined && { traceId: correlation.traceId })
    };

    config.logger.info(payload, 'otp: send (dev mode — no SMS sent)');

    return { status: 'SENT', provider: 'dev' };
  };

  return { sendOtp };
};
