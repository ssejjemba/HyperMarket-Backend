import type { BaseLogger } from 'pino';

import { IaaError } from '../../errors/IaaError';
import type { IaaMetrics } from '../../observability/iaaMetrics';
import { logIaaEvent } from '../../observability/IaaLogEvent';
import { PhoneNumber } from '../../phone/PhoneNumber';
import type { OtpChallengeService } from '../OtpChallengeService';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type RequestOtpInput = {
  /** Raw phone string from the API layer — parsing happens inside the use case. */
  phoneRaw: string;
  requestId: string;
  traceId?: string | undefined;
};

export type RequestOtpOutput = {
  challengeId: string;
  expiresAt: Date;
  resendAfterSeconds: number;
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type RequestOtpUseCaseDeps = {
  otpService: OtpChallengeService;
  logger: BaseLogger;
  metrics?: IaaMetrics | undefined;
};

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export type RequestOtpUseCase = {
  execute(input: RequestOtpInput): Promise<RequestOtpOutput>;
};

export const createRequestOtpUseCase = (deps: RequestOtpUseCaseDeps): RequestOtpUseCase => {
  const { otpService, logger, metrics } = deps;

  return {
    async execute(input: RequestOtpInput): Promise<RequestOtpOutput> {
      const { phoneRaw, requestId, traceId } = input;

      logIaaEvent(
        logger,
        {
          module: 'iaa',
          event_name: 'otp_request_start',
          request_id: requestId,
          trace_id: traceId
        },
        'otp_request: use case started',
        'debug'
      );

      // Phone parsing throws IaaError(AuthInvalidPhoneFormat) on bad input.
      const phone = PhoneNumber.parse(phoneRaw);
      const phone_masked = phone.toMasked();

      try {
        const result = await otpService.requestChallenge(phone, { requestId, traceId });

        logIaaEvent(
          logger,
          {
            module: 'iaa',
            event_name: 'otp_request_success',
            request_id: requestId,
            trace_id: traceId,
            outcome: 'success',
            challenge_id: result.challengeId,
            phone_masked
          },
          'otp_request: challenge issued'
        );

        metrics?.otpRequestTotal({ outcome: 'success' });

        return {
          challengeId: result.challengeId,
          expiresAt: result.expiresAt,
          resendAfterSeconds: result.resendAfterSeconds
        };
      } catch (e) {
        if (IaaError.is(e)) {
          logIaaEvent(
            logger,
            {
              module: 'iaa',
              event_name: 'otp_request_failure',
              request_id: requestId,
              trace_id: traceId,
              outcome: 'failure',
              error_code: e.code,
              phone_masked
            },
            'otp_request: use case failed',
            'warn'
          );
          metrics?.otpRequestTotal({ outcome: 'failure', error_code: e.code });
          throw e;
        }
        throw e;
      }
    }
  };
};
