import type { BaseLogger } from 'pino';

import { IaaError } from '../../errors/IaaError';
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
};

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export type RequestOtpUseCase = {
  execute(input: RequestOtpInput): Promise<RequestOtpOutput>;
};

export const createRequestOtpUseCase = (deps: RequestOtpUseCaseDeps): RequestOtpUseCase => {
  const { otpService, logger } = deps;

  return {
    async execute(input: RequestOtpInput): Promise<RequestOtpOutput> {
      const { phoneRaw, requestId, traceId } = input;

      logger.info(
        { event: 'usecase.otp_request.start', requestId },
        'otp_request: use case started'
      );

      // Phone parsing throws IaaError(AuthInvalidPhoneFormat) on bad input.
      const phone = PhoneNumber.parse(phoneRaw);
      const maskedPhone = phone.toMasked();

      try {
        const result = await otpService.requestChallenge(phone, { requestId, traceId });

        logger.info(
          {
            event: 'usecase.otp_request.success',
            challengeId: result.challengeId,
            maskedPhone,
            requestId
          },
          'otp_request: challenge issued'
        );

        return {
          challengeId: result.challengeId,
          expiresAt: result.expiresAt,
          resendAfterSeconds: result.resendAfterSeconds
        };
      } catch (e) {
        if (IaaError.is(e)) {
          logger.warn(
            { event: 'usecase.otp_request.failure', errorCode: e.code, maskedPhone, requestId },
            'otp_request: use case failed'
          );
          throw e;
        }
        throw e;
      }
    }
  };
};
