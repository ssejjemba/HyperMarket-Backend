export type StorefrontRevalidationMetrics = {
  storefrontRevalidationDlqTotal(labels: { reason: 'permanent_failure' }): void;
};

export const createNoopStorefrontRevalidationMetrics = (): StorefrontRevalidationMetrics => ({
  storefrontRevalidationDlqTotal() {}
});
