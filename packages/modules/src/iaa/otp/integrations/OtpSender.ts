// ---------------------------------------------------------------------------
// Correlation context
// ---------------------------------------------------------------------------

export type OtpSendCorrelation = {
  /** HTTP request / trace identifier for cross-service correlation. */
  requestId: string;
  /** The OTP challenge row this send is associated with. */
  challengeId: string;
  /** Challenge expiry for local dev sinks and provider metadata. */
  expiresAt: Date;
  /** Optional distributed-trace ID (e.g. W3C trace-id). */
  traceId?: string | undefined;
};

// ---------------------------------------------------------------------------
// Delivery result
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'SENT' | 'FAILED';

export type FailureCategory = 'timeout' | 'auth' | 'invalid_number' | 'provider_down';

export type DeliveryResult = {
  status: DeliveryStatus;
  /** Identifies which adapter/provider handled the send (e.g. "dev", "twilio"). */
  provider: string;
  /** Provider-assigned message reference, when available. */
  providerMessageId?: string | undefined;
  /** Structured failure reason, populated only when status === "FAILED". */
  failureCategory?: FailureCategory | undefined;
};

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Port for OTP delivery.
 *
 * Implementations must NEVER log `otpCode`.
 * Persisting `otpCode` is only allowed in a local-only development sink that is
 * explicitly gated off from non-dev environments.
 */
export interface OtpSender {
  sendOtp(
    phoneE164: string,
    otpCode: string,
    correlation: OtpSendCorrelation
  ): Promise<DeliveryResult>;
}
