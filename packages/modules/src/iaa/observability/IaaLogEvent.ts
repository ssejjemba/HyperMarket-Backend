import type { BaseLogger } from 'pino';

// ---------------------------------------------------------------------------
// Stable log event shape
// ---------------------------------------------------------------------------

/**
 * Every IAA-emitted log record must include these fields.
 * Using a typed shape prevents ad-hoc key names from drifting across files.
 *
 * Keys follow snake_case to match the JSON log format consumed by log aggregators.
 */
export type IaaLogEvent = {
  /** Always 'iaa' — allows filtering all IAA events in one query. */
  module: 'iaa';
  /** Stable event identifier, e.g. 'otp_request_start', 'otp_verify_success'. */
  event_name: string;
  /** HTTP request identifier for cross-request correlation. */
  request_id?: string | undefined;
  /** Distributed trace identifier (W3C trace-id or similar). */
  trace_id?: string | undefined;
  /** 'success' | 'failure' — present on terminal events only. */
  outcome?: 'success' | 'failure' | undefined;
  /** IAA error code string when outcome === 'failure'. */
  error_code?: string | undefined;
  /** OTP challenge primary key. Never log the code itself. */
  challenge_id?: string | undefined;
  /**
   * Masked phone number, e.g. '+*********5678'.
   * Must never be the raw E.164 value.
   */
  phone_masked?: string | undefined;
  /** User primary key — safe to log. */
  user_id?: string | undefined;
  /** Number of active tenant memberships resolved for a session. */
  membership_count?: number | undefined;
  /** Remaining OTP attempts after a failed code check. */
  remaining_attempts?: number | undefined;
  /** Provider identifier for downstream OTP verification calls. */
  provider?: string | undefined;
  /** Provider failure category used for metrics/alerting. */
  failure_category?: string | undefined;
  /** Retry delay advertised to clients on rate-limits. */
  retry_after_seconds?: number | undefined;
  /** Request source IP, when safe and useful for abuse detection logs. */
  ip_address?: string | undefined;
};

// ---------------------------------------------------------------------------
// Logger helper
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Emit a structured IAA log event.
 *
 * Using `debug` level for intermediate step logs ensures they are suppressed
 * in production when LOG_LEVEL=info, satisfying the "disable debug step logs
 * in production" rule without any explicit env check.
 */
export const logIaaEvent = (
  logger: BaseLogger,
  event: IaaLogEvent,
  message: string,
  level: LogLevel = 'info'
): void => {
  logger[level](event, message);
};
