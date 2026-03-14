import type { FastifyRequest } from 'fastify';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { VerifyOtpUseCase } from '../../otp/application/VerifyOtpUseCase';
import { verifyOtpSchema } from '../schemas/verifyOtp';

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

type MembershipItem = {
  tenant_id: string;
  role: string;
  status: string;
};

export type VerifyOtpResponse = {
  /** Signed JWT — never log this value. */
  access_token: string;
  expires_at: string;
  user_id: string;
  memberships: MembershipItem[];
};

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export const makeVerifyOtpHandler =
  (useCase: VerifyOtpUseCase) =>
  async (request: FastifyRequest): Promise<VerifyOtpResponse> => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: parsed.error.errors[0]?.message ?? 'Invalid request body'
      });
    }

    // Never log otpCode — only schema-level existence is confirmed here.
    const result = await useCase.execute({
      challengeId: parsed.data.challenge_id,
      phoneRaw: parsed.data.phone,
      otpCode: parsed.data.code,
      requestId: request.id,
      traceId: (request.headers['x-trace-id'] as string | undefined) ?? undefined
    });

    return {
      // access_token intentionally not logged — callers must treat it as a secret
      access_token: result.accessToken,
      expires_at: result.expiresAt.toISOString(),
      user_id: result.userId,
      memberships: result.memberships.map((m) => ({
        tenant_id: m.tenantId,
        role: m.role,
        status: m.status
      }))
    };
  };
