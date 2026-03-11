/**
 * Pure policy configuration for OTP challenges.
 *
 * All values are explicit and injected — no global singletons, no env reads.
 * The service layer constructs one instance and passes it through.
 */
export class OtpChallengePolicy {
  readonly challengeTtlSeconds: number;
  readonly resendCooldownSeconds: number;
  readonly maxAttempts: number;

  constructor(params: {
    challengeTtlSeconds: number;
    resendCooldownSeconds: number;
    maxAttempts: number;
  }) {
    this.challengeTtlSeconds = params.challengeTtlSeconds;
    this.resendCooldownSeconds = params.resendCooldownSeconds;
    this.maxAttempts = params.maxAttempts;
  }

  /**
   * Returns true when a resend is allowed.
   * A resend is allowed once the cooldown window has elapsed since `lastSentAt`.
   */
  canResend(lastSentAt: Date, now: Date): boolean {
    const elapsedMs = now.getTime() - lastSentAt.getTime();
    return elapsedMs >= this.resendCooldownSeconds * 1000;
  }
}
