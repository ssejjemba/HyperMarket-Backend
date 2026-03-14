import type { BaseLogger } from 'pino';

import { IaaError } from '../../errors/IaaError';
import type { MembershipClaim } from '../../membership/MembershipClaim';
import type { MembershipReader } from '../../membership/MembershipReader';
import { PhoneNumber } from '../../phone/PhoneNumber';
import type { SessionService } from '../../session/SessionService';
import type { UserService } from '../../user/UserService';
import type { OtpChallengeService } from '../OtpChallengeService';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export type VerifyOtpInput = {
  challengeId: string;
  /** Raw phone string from the API layer — parsing happens inside the use case. */
  phoneRaw: string;
  otpCode: string;
  requestId: string;
  traceId?: string | undefined;
};

export type VerifyOtpOutput = {
  /** Signed JWT bearer token. Never log this value. */
  accessToken: string;
  expiresAt: Date;
  userId: string;
  memberships: MembershipClaim[];
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type VerifyOtpUseCaseDeps = {
  otpService: OtpChallengeService;
  userService: UserService;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  logger: BaseLogger;
};

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export type VerifyOtpUseCase = {
  execute(input: VerifyOtpInput): Promise<VerifyOtpOutput>;
};

/**
 * Orchestrates OTP verification → user provisioning → session issuance → membership resolution.
 *
 * Transaction note: verifyChallenge (challenge consume) and getOrCreateByPhone (user create)
 * are sequential DB writes without a shared transaction boundary. If user creation fails after
 * the challenge is consumed, the challenge is gone and the user must request a new OTP.
 * For production, wrap both ops in a single DB transaction via a scoped repository factory.
 *
 * TODO: add a `runInTransaction` dep and re-create scoped repos inside it.
 */
export const createVerifyOtpUseCase = (deps: VerifyOtpUseCaseDeps): VerifyOtpUseCase => {
  const { otpService, userService, sessionService, membershipReader, logger } = deps;

  return {
    async execute(input: VerifyOtpInput): Promise<VerifyOtpOutput> {
      const { challengeId, phoneRaw, otpCode, requestId, traceId } = input;

      logger.info(
        { event: 'usecase.otp_verify.start', challengeId, requestId },
        'otp_verify: use case started'
      );

      // Phone parsing throws IaaError(AuthInvalidPhoneFormat) on bad input.
      const phone = PhoneNumber.parse(phoneRaw);
      const maskedPhone = phone.toMasked();

      try {
        // 1. Verify challenge — consumes it or throws a typed IaaError.
        await otpService.verifyChallenge(challengeId, phone, otpCode, { requestId, traceId });

        // 2. Provision user — find-or-create; throws AUTH_USER_SUSPENDED.
        const user = await userService.getOrCreateByPhone(phone);

        // 3. Issue session JWT — throws AUTH_SESSION_ISSUE_FAILED on unexpected error.
        const { accessToken, expiresAt } = await sessionService.issueSession(user);

        // 4. Resolve memberships (read-only, best-effort — non-fatal empty list is acceptable).
        const memberships = await membershipReader.listMemberships(user.id);

        logger.info(
          {
            event: 'usecase.otp_verify.success',
            challengeId,
            userId: user.id,
            maskedPhone,
            membershipCount: memberships.length,
            requestId
          },
          'otp_verify: use case succeeded'
        );

        return { accessToken, expiresAt, userId: user.id, memberships };
      } catch (e) {
        if (IaaError.is(e)) {
          logger.warn(
            {
              event: 'usecase.otp_verify.failure',
              challengeId,
              maskedPhone,
              errorCode: e.code,
              requestId
            },
            'otp_verify: use case failed'
          );
          throw e;
        }
        throw e;
      }
    }
  };
};
