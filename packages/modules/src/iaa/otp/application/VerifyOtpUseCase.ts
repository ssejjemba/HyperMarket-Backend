import type { BaseLogger } from 'pino';

import { IaaError } from '../../errors/IaaError';
import type { MembershipClaim } from '../../membership/MembershipClaim';
import type { MembershipReader } from '../../membership/MembershipReader';
import { logIaaEvent } from '../../observability/IaaLogEvent';
import type { IaaMetrics } from '../../observability/iaaMetrics';
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
  metrics?: IaaMetrics | undefined;
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
  const { otpService, userService, sessionService, membershipReader, logger, metrics } = deps;

  return {
    async execute(input: VerifyOtpInput): Promise<VerifyOtpOutput> {
      const { challengeId, phoneRaw, otpCode, requestId, traceId } = input;

      logIaaEvent(
        logger,
        {
          module: 'iaa',
          event_name: 'otp_verify_start',
          request_id: requestId,
          trace_id: traceId,
          challenge_id: challengeId
        },
        'otp_verify: use case started',
        'debug'
      );

      // Phone parsing throws IaaError(AuthInvalidPhoneFormat) on bad input.
      const phone = PhoneNumber.parse(phoneRaw);
      const phone_masked = phone.toMasked();

      try {
        // 1. Verify challenge — consumes it or throws a typed IaaError.
        await otpService.verifyChallenge(challengeId, phone, otpCode, { requestId, traceId });

        // 2. Provision user — find-or-create; throws AUTH_USER_SUSPENDED.
        const user = await userService.getOrCreateByPhone(phone);

        // 3. Issue session JWT — throws AUTH_SESSION_ISSUE_FAILED on unexpected error.
        const { accessToken, expiresAt } = await sessionService.issueSession(user);

        // 4. Resolve memberships (read-only, best-effort — non-fatal empty list is acceptable).
        const memberships = await membershipReader.listMemberships(user.id);

        logIaaEvent(
          logger,
          {
            module: 'iaa',
            event_name: 'otp_verify_success',
            request_id: requestId,
            trace_id: traceId,
            outcome: 'success',
            challenge_id: challengeId,
            phone_masked,
            user_id: user.id,
            membership_count: memberships.length
          },
          'otp_verify: use case succeeded'
        );

        metrics?.otpVerifyTotal({ outcome: 'success' });

        return { accessToken, expiresAt, userId: user.id, memberships };
      } catch (e) {
        if (IaaError.is(e)) {
          logIaaEvent(
            logger,
            {
              module: 'iaa',
              event_name: 'otp_verify_failure',
              request_id: requestId,
              trace_id: traceId,
              outcome: 'failure',
              challenge_id: challengeId,
              phone_masked,
              error_code: e.code
            },
            'otp_verify: use case failed',
            'warn'
          );
          metrics?.otpVerifyTotal({ outcome: 'failure', error_code: e.code });
          throw e;
        }
        throw e;
      }
    }
  };
};
