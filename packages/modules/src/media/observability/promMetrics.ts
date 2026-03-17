import type { MetricsRegistry } from '@hypermarket/core';

import type { MediaMetrics } from './mediaMetrics';

export const createPrometheusMediaMetrics = (registry: MetricsRegistry): MediaMetrics => {
  const uploadTokenIssuedTotal = registry.createCounter<{
    outcome: 'success' | 'failure';
    error_code: string;
  }>(
    'media_upload_token_issued_total',
    'Media upload token issue attempts grouped by outcome and error code',
    ['outcome', 'error_code']
  );
  const assetConfirmTotal = registry.createCounter<{
    outcome: 'success' | 'failure';
    error_code: string;
  }>('media_asset_confirm_total', 'Media asset confirmations grouped by outcome and error code', [
    'outcome',
    'error_code'
  ]);
  const assetDeleteTotal = registry.createCounter<{
    outcome: 'success' | 'failure';
    error_code: string;
  }>('media_asset_delete_total', 'Media asset deletions grouped by outcome and error code', [
    'outcome',
    'error_code'
  ]);

  return {
    uploadTokenIssuedTotal(tags) {
      uploadTokenIssuedTotal.inc({
        outcome: tags.outcome,
        error_code: tags.error_code ?? 'none'
      });
    },
    assetConfirmTotal(tags) {
      assetConfirmTotal.inc({
        outcome: tags.outcome,
        error_code: tags.error_code ?? 'none'
      });
    },
    assetDeleteTotal(tags) {
      assetDeleteTotal.inc({
        outcome: tags.outcome,
        error_code: tags.error_code ?? 'none'
      });
    }
  };
};
