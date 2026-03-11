// ---------------------------------------------------------------------------
// Correlation context
// ---------------------------------------------------------------------------

export type OtpSendCorrelation = {
  /** HTTP request / trace identifier for cross-service correlation. */
  requestId: string;
  /** The OTP challenge row this send is associated with. */
  challengeId: string;
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
 * Implementations must NEVER log or persist `otpCode`.
 * The only safe observable for `otpCode` is the hashed value already stored
 * in the challenge row.
 */
export interface OtpSender {
  sendOtp(
    phoneE164: string,
    otpCode: string,
    correlation: OtpSendCorrelation
  ): Promise<DeliveryResult>;
}
