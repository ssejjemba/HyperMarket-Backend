import type { FastifyRequest } from 'fastify';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { RequestOtpUseCase } from '../../otp/application/RequestOtpUseCase';
import { requestOtpSchema } from '../schemas/requestOtp';

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export type RequestOtpResponse = {
  challenge_id: string;
  expires_at: string;
  resend_after_seconds: number;
};

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export const makeRequestOtpHandler =
  (useCase: RequestOtpUseCase) =>
  async (request: FastifyRequest): Promise<RequestOtpResponse> => {
    const parsed = requestOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: parsed.error.errors[0]?.message ?? 'Invalid request body'
      });
    }

    const result = await useCase.execute({
      phoneRaw: parsed.data.phone,
      requestId: request.id,
      traceId: (request.headers['x-trace-id'] as string | undefined) ?? undefined,
      ipAddress: request.ip
    });

    return {
      challenge_id: result.challengeId,
      expires_at: result.expiresAt.toISOString(),
      resend_after_seconds: result.resendAfterSeconds
    };
  };
