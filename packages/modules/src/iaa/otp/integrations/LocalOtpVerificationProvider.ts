import crypto from 'node:crypto';

import type { BaseLogger } from 'pino';

import { otpSink } from '@hypermarket/core/dev/otpSink';

import { PhoneNumber } from '../../phone/PhoneNumber';
import type {
  CheckOtpVerificationInput,
  CheckOtpVerificationResult,
  OtpVerificationProvider,
  StartOtpVerificationInput,
  StartOtpVerificationResult
} from './OtpVerificationProvider';

type ProviderConfig = {
  logger: BaseLogger;
};

type VerificationLogPayload = {
  event: 'otp.verify.start';
  provider: 'local';
  maskedPhone: string;
  challengeId: string;
  requestId: string;
  traceId?: string;
};

const generateCode = (): string => String(crypto.randomInt(100_000, 1_000_000));

export const createLocalOtpVerificationProvider = (
  config: ProviderConfig
): OtpVerificationProvider => {
  return {
    async startVerification(input: StartOtpVerificationInput): Promise<StartOtpVerificationResult> {
      const code = generateCode();
      otpSink.put(input.challengeId, code, input.expiresAt);

      const payload: VerificationLogPayload = {
        event: 'otp.verify.start',
        provider: 'local',
        maskedPhone: PhoneNumber.parse(input.phoneE164).toMasked(),
        challengeId: input.challengeId,
        requestId: input.requestId,
        ...(input.traceId !== undefined && { traceId: input.traceId })
      };

      config.logger.info(payload, 'otp: local verification code stored in dev sink');

      return { provider: 'local' };
    },

    async checkVerification(input: CheckOtpVerificationInput): Promise<CheckOtpVerificationResult> {
      const record = otpSink.get(input.challengeId);
      if (record === null) {
        return { approved: false, provider: 'local' };
      }

      return {
        approved: record.otpCode === input.code,
        provider: 'local'
      };
    }
  };
};
