// ---------------------------------------------------------------------------
// Metrics interface — counter increments only; no histograms for now.
// ---------------------------------------------------------------------------

export type OtpRequestLabels = {
  outcome: 'success' | 'failure';
  error_code?: string | undefined;
};

export type OtpVerifyLabels = {
  outcome: 'success' | 'failure';
  error_code?: string | undefined;
};

export type SessionValidateLabels = {
  outcome: 'success' | 'failure';
  error_code?: string | undefined;
};

/**
 * All IAA metric counters.
 * Implementations inject the actual counter backend (Prometheus, StatsD, etc.).
 * Tests use `createInMemoryIaaMetrics()` to assert increment counts.
 */
export type IaaMetrics = {
  /** Incremented once per OTP request use-case execution (success or failure). */
  otpRequestTotal(labels: OtpRequestLabels): void;
  /** Incremented once per OTP verify use-case execution (success or failure). */
  otpVerifyTotal(labels: OtpVerifyLabels): void;
  /** Incremented once per /auth/session validation (success or failure). */
  sessionValidateTotal(labels: SessionValidateLabels): void;
};

// ---------------------------------------------------------------------------
// No-op implementation — used in production composition root until a real
// metrics backend is wired up.
// ---------------------------------------------------------------------------

export const createNoopIaaMetrics = (): IaaMetrics => ({
  otpRequestTotal: () => undefined,
  otpVerifyTotal: () => undefined,
  sessionValidateTotal: () => undefined
});

// ---------------------------------------------------------------------------
// In-memory implementation — used in tests to assert counter increments.
// ---------------------------------------------------------------------------

export type InMemoryIaaMetrics = IaaMetrics & {
  /** All label sets passed to `otpRequestTotal`. */
  readonly otpRequestCalls: OtpRequestLabels[];
  /** All label sets passed to `otpVerifyTotal`. */
  readonly otpVerifyCalls: OtpVerifyLabels[];
  /** All label sets passed to `sessionValidateTotal`. */
  readonly sessionValidateCalls: SessionValidateLabels[];
};

export const createInMemoryIaaMetrics = (): InMemoryIaaMetrics => {
  const otpRequestCalls: OtpRequestLabels[] = [];
  const otpVerifyCalls: OtpVerifyLabels[] = [];
  const sessionValidateCalls: SessionValidateLabels[] = [];

  return {
    otpRequestCalls,
    otpVerifyCalls,
    sessionValidateCalls,
    otpRequestTotal: (labels) => void otpRequestCalls.push(labels),
    otpVerifyTotal: (labels) => void otpVerifyCalls.push(labels),
    sessionValidateTotal: (labels) => void sessionValidateCalls.push(labels)
  };
};
