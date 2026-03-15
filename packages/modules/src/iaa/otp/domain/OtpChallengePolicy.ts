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
  readonly rateLimitWindowSeconds: number;
  readonly rateLimitMaxChallengesPerPhone: number;
  readonly phoneRateLimitBurstWindowSeconds: number;
  readonly phoneRateLimitBurstMaxChallenges: number;
  readonly phoneRateLimitDailyWindowSeconds: number;
  readonly phoneRateLimitDailyMaxChallenges: number;
  readonly ipRateLimitWindowSeconds: number;
  readonly ipRateLimitMaxChallenges: number;

  constructor(params: {
    challengeTtlSeconds: number;
    resendCooldownSeconds: number;
    maxAttempts: number;
    rateLimitWindowSeconds?: number;
    rateLimitMaxChallengesPerPhone?: number;
    phoneRateLimitBurstWindowSeconds?: number;
    phoneRateLimitBurstMaxChallenges?: number;
    phoneRateLimitDailyWindowSeconds?: number;
    phoneRateLimitDailyMaxChallenges?: number;
    ipRateLimitWindowSeconds?: number;
    ipRateLimitMaxChallenges?: number;
  }) {
    this.challengeTtlSeconds = params.challengeTtlSeconds;
    this.resendCooldownSeconds = params.resendCooldownSeconds;
    this.maxAttempts = params.maxAttempts;

    this.phoneRateLimitBurstWindowSeconds =
      params.phoneRateLimitBurstWindowSeconds ?? params.rateLimitWindowSeconds ?? 600;
    this.phoneRateLimitBurstMaxChallenges =
      params.phoneRateLimitBurstMaxChallenges ?? params.rateLimitMaxChallengesPerPhone ?? 3;
    this.phoneRateLimitDailyWindowSeconds = params.phoneRateLimitDailyWindowSeconds ?? 86_400;
    this.phoneRateLimitDailyMaxChallenges = params.phoneRateLimitDailyMaxChallenges ?? 10;
    this.ipRateLimitWindowSeconds = params.ipRateLimitWindowSeconds ?? 600;
    this.ipRateLimitMaxChallenges = params.ipRateLimitMaxChallenges ?? 20;

    // Backwards-compatible aliases for older tests and call sites.
    this.rateLimitWindowSeconds = this.phoneRateLimitBurstWindowSeconds;
    this.rateLimitMaxChallengesPerPhone = this.phoneRateLimitBurstMaxChallenges;
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
