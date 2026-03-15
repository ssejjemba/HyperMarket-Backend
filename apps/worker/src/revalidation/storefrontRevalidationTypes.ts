import type { RevalidationRequest } from '@hypermarket/contracts';

export type StorefrontRevalidationJobPayload = RevalidationRequest & {
  event_type: 'Publish.Completed' | 'Rollback.Completed';
  config_id: string;
  previous_config_id: string | null;
};
