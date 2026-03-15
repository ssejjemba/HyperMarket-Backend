export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface OtpRequestRateLimiter {
  checkPhone(phoneE164: string): Promise<RateLimitDecision>;
  checkIp(ipAddress: string): Promise<RateLimitDecision>;
}
