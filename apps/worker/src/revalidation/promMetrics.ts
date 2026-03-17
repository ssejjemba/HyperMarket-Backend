import type { MetricsRegistry } from '@hypermarket/core';

import type { StorefrontRevalidationMetrics } from './storefrontRevalidationMetrics';

export const createPrometheusStorefrontRevalidationMetrics = (
  registry: MetricsRegistry
): StorefrontRevalidationMetrics => {
  const storefrontRevalidationDlqTotal = registry.createCounter<{
    reason: 'permanent_failure';
  }>(
    'storefront_revalidation_dlq_total',
    'Storefront revalidation jobs moved to the DLQ grouped by reason',
    ['reason']
  );

  return {
    storefrontRevalidationDlqTotal(labels) {
      storefrontRevalidationDlqTotal.inc(labels);
    }
  };
};
