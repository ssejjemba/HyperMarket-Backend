import type { ErrorCode } from '@hypermarket/contracts';
import { AppError } from '@hypermarket/contracts';

export type FulfillmentErrorCode =
  | ErrorCode.FulNoFulfillmentModeEnabled
  | ErrorCode.FulDeliveryEnabledWithoutZones
  | ErrorCode.FulSettingsInvalid
  | ErrorCode.FulZoneNotFound
  | ErrorCode.FulZoneInactive
  | ErrorCode.FulZoneNameTaken
  | ErrorCode.FulZoneInvalid
  | ErrorCode.FulStoreClosed
  | ErrorCode.FulFulfillmentSelectionInvalid
  | ErrorCode.FulDeliveryMinOrderNotMet
  | ErrorCode.FulDeliveryNotAvailable
  | ErrorCode.FulPickupNotAvailable;

export class FulfillmentError extends AppError {
  constructor(input: {
    code: FulfillmentErrorCode;
    message: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(input);
    this.name = 'FulfillmentError';
  }
}
