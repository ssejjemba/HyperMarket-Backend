import { ErrorCode } from '@hypermarket/contracts';

import { FulfillmentError } from '../errors/FulfillmentError';
import type { BusinessHours } from './BusinessHours';

export type DeliveryZone = {
  id: string;
  tenantId: string;
  name: string;
  feeAmount: number;
  minOrderAmount: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
};

export type FulfillmentSettings = {
  tenantId: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupInstructions: string | null;
  deliveryInstructions: string | null;
  businessHours: BusinessHours;
  cutoffRules: Record<string, unknown>;
  updatedAt: Date;
};

export type FulfillmentPolicy = {
  settings: FulfillmentSettings;
  zones: DeliveryZone[];
};

export type FulfillmentSelection =
  | {
      type: 'pickup';
      pickup_location_label: string;
      instructions?: string | null;
    }
  | {
      type: 'delivery';
      zone_id?: string | null;
      zone_name?: string | null;
      address_label: string;
      location_hint?: string | null;
      recipient_name: string;
      recipient_phone: string;
      instructions?: string | null;
    };

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const requireText = (
  value: string | null | undefined,
  field: string,
  code: ErrorCode.FulFulfillmentSelectionInvalid | ErrorCode.FulZoneInvalid
): string => {
  const normalized = normalizeOptionalText(value);
  if (normalized === null) {
    throw new FulfillmentError({
      code,
      message: `${field} is required`,
      details: {
        field
      }
    });
  }

  return normalized;
};

export const assertFulfillmentModes = (settings: {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
}): void => {
  if (!settings.pickupEnabled && !settings.deliveryEnabled) {
    throw new FulfillmentError({
      code: ErrorCode.FulNoFulfillmentModeEnabled,
      message: 'At least one fulfillment mode must be enabled'
    });
  }
};

export const assertDeliveryZoneInput = (input: {
  name: string;
  feeAmount: number;
  minOrderAmount?: number | null;
}): {
  name: string;
  feeAmount: number;
  minOrderAmount: number | null;
} => {
  const name = requireText(input.name, 'name', ErrorCode.FulZoneInvalid);
  if (!Number.isInteger(input.feeAmount) || input.feeAmount < 0) {
    throw new FulfillmentError({
      code: ErrorCode.FulZoneInvalid,
      message: 'fee_amount must be an integer greater than or equal to 0'
    });
  }

  const minOrderAmount = input.minOrderAmount ?? null;
  if (minOrderAmount !== null && (!Number.isInteger(minOrderAmount) || minOrderAmount < 0)) {
    throw new FulfillmentError({
      code: ErrorCode.FulZoneInvalid,
      message: 'min_order_amount must be an integer greater than or equal to 0'
    });
  }

  return {
    name,
    feeAmount: input.feeAmount,
    minOrderAmount
  };
};

const findZone = (
  policy: FulfillmentPolicy,
  selection: Extract<FulfillmentSelection, { type: 'delivery' }>
): DeliveryZone => {
  const zoneId = normalizeOptionalText(selection.zone_id);
  const zoneName = normalizeOptionalText(selection.zone_name);

  if (zoneId === null && zoneName === null) {
    throw new FulfillmentError({
      code: ErrorCode.FulFulfillmentSelectionInvalid,
      message: 'Delivery requires zone_id or zone_name'
    });
  }

  const zone =
    zoneId !== null
      ? (policy.zones.find((entry) => entry.id === zoneId) ?? null)
      : (policy.zones.find((entry) => entry.name === zoneName) ?? null);

  if (zone === null) {
    throw new FulfillmentError({
      code: ErrorCode.FulZoneNotFound,
      message: 'Delivery zone not found'
    });
  }

  if (!zone.isActive) {
    throw new FulfillmentError({
      code: ErrorCode.FulZoneInactive,
      message: 'Delivery zone is inactive'
    });
  }

  return zone;
};

export const calculateDeliveryFee = (
  policy: FulfillmentPolicy,
  selection: Extract<FulfillmentSelection, { type: 'delivery' }>,
  orderSubtotal: number
): { zone: DeliveryZone; feeAmount: number } => {
  if (!policy.settings.deliveryEnabled) {
    throw new FulfillmentError({
      code: ErrorCode.FulDeliveryNotAvailable,
      message: 'Delivery is not enabled for this tenant'
    });
  }

  const zone = findZone(policy, selection);
  if (zone.minOrderAmount !== null && orderSubtotal < zone.minOrderAmount) {
    throw new FulfillmentError({
      code: ErrorCode.FulDeliveryMinOrderNotMet,
      message: 'Order subtotal does not meet the minimum required for delivery',
      details: {
        min_order_amount: zone.minOrderAmount,
        subtotal_amount: orderSubtotal,
        zone_id: zone.id
      }
    });
  }

  return {
    zone,
    feeAmount: zone.feeAmount
  };
};

export const validateFulfillmentSelection = (
  policy: FulfillmentPolicy,
  selection: FulfillmentSelection,
  orderSubtotal: number
): {
  deliveryFeeAmount: number;
  zone: DeliveryZone | null;
} => {
  assertFulfillmentModes(policy.settings);

  if (selection.type === 'pickup') {
    if (!policy.settings.pickupEnabled) {
      throw new FulfillmentError({
        code: ErrorCode.FulPickupNotAvailable,
        message: 'Pickup is not enabled for this tenant'
      });
    }

    requireText(
      selection.pickup_location_label,
      'pickup_location_label',
      ErrorCode.FulFulfillmentSelectionInvalid
    );
    return {
      deliveryFeeAmount: 0,
      zone: null
    };
  }

  requireText(selection.address_label, 'address_label', ErrorCode.FulFulfillmentSelectionInvalid);
  requireText(selection.recipient_name, 'recipient_name', ErrorCode.FulFulfillmentSelectionInvalid);
  requireText(
    selection.recipient_phone,
    'recipient_phone',
    ErrorCode.FulFulfillmentSelectionInvalid
  );

  const result = calculateDeliveryFee(policy, selection, orderSubtotal);
  return {
    deliveryFeeAmount: result.feeAmount,
    zone: result.zone
  };
};
