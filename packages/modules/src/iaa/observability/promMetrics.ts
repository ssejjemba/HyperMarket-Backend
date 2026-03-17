import type { MetricsRegistry } from '@hypermarket/core';

import type { IaaMetrics } from './iaaMetrics';

export const createPrometheusIaaMetrics = (registry: MetricsRegistry): IaaMetrics => {
  const otpRequestTotal = registry.createCounter<{
    outcome: 'success' | 'failure';
    error_code: string;
  }>('iaa_otp_request_total', 'OTP request executions grouped by outcome and error code', [
    'outcome',
    'error_code'
  ]);
  const otpVerifyTotal = registry.createCounter<{
    outcome: 'success' | 'failure';
    error_code: string;
  }>('iaa_otp_verify_total', 'OTP verification executions grouped by outcome and error code', [
    'outcome',
    'error_code'
  ]);
  const providerCallsTotal = registry.createCounter<{
    outcome: 'success' | 'failure';
    failure_category: string;
  }>('iaa_provider_calls_total', 'OTP provider calls grouped by outcome and failure category', [
    'outcome',
    'failure_category'
  ]);
  const sessionValidateTotal = registry.createCounter<{
    outcome: 'success' | 'failure';
    error_code: string;
  }>('iaa_session_validate_total', 'Session validation calls grouped by outcome and error code', [
    'outcome',
    'error_code'
  ]);

  return {
    otpRequestTotal(labels) {
      otpRequestTotal.inc({
        outcome: labels.outcome,
        error_code: labels.error_code ?? 'none'
      });
    },
    otpVerifyTotal(labels) {
      otpVerifyTotal.inc({
        outcome: labels.outcome,
        error_code: labels.error_code ?? 'none'
      });
    },
    providerCallsTotal(labels) {
      providerCallsTotal.inc({
        outcome: labels.outcome,
        failure_category: labels.failure_category ?? 'none'
      });
    },
    sessionValidateTotal(labels) {
      sessionValidateTotal.inc({
        outcome: labels.outcome,
        error_code: labels.error_code ?? 'none'
      });
    }
  };
};
