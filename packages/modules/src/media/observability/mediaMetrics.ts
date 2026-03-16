import type { MediaErrorCode } from '../errors/MediaError';

type MetricTags = {
  outcome: 'success' | 'failure';
  error_code?: MediaErrorCode | undefined;
};

export interface MediaMetrics {
  uploadTokenIssuedTotal(tags: MetricTags): void;
  assetConfirmTotal(tags: MetricTags): void;
  assetDeleteTotal(tags: MetricTags): void;
}

export interface InMemoryMediaMetrics extends MediaMetrics {
  counters: {
    uploadTokenIssuedTotal: Array<MetricTags>;
    assetConfirmTotal: Array<MetricTags>;
    assetDeleteTotal: Array<MetricTags>;
  };
}

export const createNoopMediaMetrics = (): MediaMetrics => ({
  uploadTokenIssuedTotal() {},
  assetConfirmTotal() {},
  assetDeleteTotal() {}
});

export const createInMemoryMediaMetrics = (): InMemoryMediaMetrics => {
  const counters: InMemoryMediaMetrics['counters'] = {
    uploadTokenIssuedTotal: [],
    assetConfirmTotal: [],
    assetDeleteTotal: []
  };

  return {
    counters,
    uploadTokenIssuedTotal(tags) {
      counters.uploadTokenIssuedTotal.push(tags);
    },
    assetConfirmTotal(tags) {
      counters.assetConfirmTotal.push(tags);
    },
    assetDeleteTotal(tags) {
      counters.assetDeleteTotal.push(tags);
    }
  };
};
