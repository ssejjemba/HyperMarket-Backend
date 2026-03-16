import type { RevalidationRequest } from '@hypermarket/contracts';

export type StorefrontRevalidationJobPayload = RevalidationRequest & {
  event_type: string;
  config_id?: string;
  previous_config_id?: string | null;
};
