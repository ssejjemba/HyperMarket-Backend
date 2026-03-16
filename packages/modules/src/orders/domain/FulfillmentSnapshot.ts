import { ErrorCode } from '@hypermarket/contracts';

import { OrderError } from '../errors/OrderError';

export type PickupFulfillmentInput = {
  type: 'pickup';
  pickup_location_label: string;
  instructions?: string | null;
};

export type DeliveryFulfillmentInput = {
  type: 'delivery';
  zone_id?: string | null;
  zone_name?: string | null;
  address_label: string;
  location_hint?: string | null;
  recipient_name: string;
  recipient_phone: string;
  instructions?: string | null;
};

export type FulfillmentInput = PickupFulfillmentInput | DeliveryFulfillmentInput;

export type PickupFulfillmentSnapshot = {
  type: 'pickup';
  pickup_location_label: string;
  instructions: string | null;
};

export type DeliveryFulfillmentSnapshot = {
  type: 'delivery';
  zone_id: string | null;
  zone_name: string | null;
  delivery_fee_amount: number;
  address_label: string;
  location_hint: string | null;
  recipient_name: string;
  recipient_phone: string;
  instructions: string | null;
};

export type FulfillmentSnapshot = PickupFulfillmentSnapshot | DeliveryFulfillmentSnapshot;

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

const requireText = (value: string | null | undefined, field: string): string => {
  const normalized = normalizeOptionalText(value);

  if (normalized === null) {
    throw new OrderError({
      code: ErrorCode.OrderFulfillmentInvalid,
      message: `${field} is required`,
      details: {
        field
      }
    });
  }

  return normalized;
};

export const buildFulfillmentSnapshot = (
  input: FulfillmentInput,
  deliveryFeeAmount: number
): FulfillmentSnapshot => {
  if (!Number.isInteger(deliveryFeeAmount) || deliveryFeeAmount < 0) {
    throw new OrderError({
      code: ErrorCode.OrderFulfillmentInvalid,
      message: 'delivery_fee_amount must be an integer greater than or equal to 0'
    });
  }

  if (input.type === 'pickup') {
    return {
      type: 'pickup',
      pickup_location_label: requireText(input.pickup_location_label, 'pickup_location_label'),
      instructions: normalizeOptionalText(input.instructions)
    };
  }

  const zoneId = normalizeOptionalText(input.zone_id);
  const zoneName = normalizeOptionalText(input.zone_name);
  if (zoneId === null && zoneName === null) {
    throw new OrderError({
      code: ErrorCode.OrderFulfillmentInvalid,
      message: 'delivery requires zone_id or zone_name'
    });
  }

  return {
    type: 'delivery',
    zone_id: zoneId,
    zone_name: zoneName,
    delivery_fee_amount: deliveryFeeAmount,
    address_label: requireText(input.address_label, 'address_label'),
    location_hint: normalizeOptionalText(input.location_hint),
    recipient_name: requireText(input.recipient_name, 'recipient_name'),
    recipient_phone: requireText(input.recipient_phone, 'recipient_phone'),
    instructions: normalizeOptionalText(input.instructions)
  };
};
