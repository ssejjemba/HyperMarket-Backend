export type StorefrontRevalidationRequest = {
  tenant_id: string;
  targets: string[];
};

export type StorefrontRevalidationJobPayload = StorefrontRevalidationRequest & {
  event_type: 'Publish.Completed' | 'Rollback.Completed';
  config_id: string;
  previous_config_id: string | null;
};
