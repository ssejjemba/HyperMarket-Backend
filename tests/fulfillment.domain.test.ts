import { describe, expect, it } from 'vitest';

import {
  assertDeliveryZoneInput,
  calculateDeliveryFee,
  isStoreOpen,
  validateFulfillmentSelection,
  type FulfillmentPolicy
} from '@hypermarket/modules/fulfillment';

const policy: FulfillmentPolicy = {
  settings: {
    tenantId: 'tenant-1',
    pickupEnabled: true,
    deliveryEnabled: true,
    pickupInstructions: null,
    deliveryInstructions: null,
    businessHours: {
      mon: {
        is_closed: false,
        open_time: '09:00',
        close_time: '17:00'
      },
      tue: {
        is_closed: true
      }
    },
    cutoffRules: {},
    updatedAt: new Date()
  },
  zones: [
    {
      id: 'zone-1',
      tenantId: 'tenant-1',
      name: 'Central Kampala',
      feeAmount: 5000,
      minOrderAmount: 20000,
      isActive: true,
      sortOrder: 0,
      createdAt: new Date()
    }
  ]
};

describe('FUL domain', () => {
  it('identifies when the store is open', () => {
    const open = isStoreOpen(policy.settings.businessHours, new Date('2026-03-16T09:30:00Z'));
    expect(open).toEqual({ open: true });
  });

  it('identifies closed days and closed hours', () => {
    expect(isStoreOpen(policy.settings.businessHours, new Date('2026-03-17T10:00:00Z'))).toEqual({
      open: false,
      reason: 'CLOSED_TODAY'
    });

    expect(isStoreOpen(policy.settings.businessHours, new Date('2026-03-16T04:00:00Z'))).toEqual({
      open: false,
      reason: 'OUTSIDE_BUSINESS_HOURS'
    });
  });

  it('calculates delivery fees and enforces minimum order amounts', () => {
    const fee = calculateDeliveryFee(
      policy,
      {
        type: 'delivery',
        zone_id: 'zone-1',
        address_label: 'Plot 1',
        recipient_name: 'Amina',
        recipient_phone: '+256700000001'
      },
      25000
    );

    expect(fee.feeAmount).toBe(5000);
    expect(() =>
      calculateDeliveryFee(
        policy,
        {
          type: 'delivery',
          zone_id: 'zone-1',
          address_label: 'Plot 1',
          recipient_name: 'Amina',
          recipient_phone: '+256700000001'
        },
        10000
      )
    ).toThrow(/minimum required for delivery/);
  });

  it('validates pickup and delivery selections deterministically', () => {
    expect(
      validateFulfillmentSelection(
        policy,
        {
          type: 'pickup',
          pickup_location_label: 'Main Branch'
        },
        10000
      )
    ).toEqual({
      deliveryFeeAmount: 0,
      zone: null
    });

    expect(
      validateFulfillmentSelection(
        policy,
        {
          type: 'delivery',
          zone_name: 'Central Kampala',
          address_label: 'Plot 1',
          recipient_name: 'Amina',
          recipient_phone: '+256700000001'
        },
        25000
      )
    ).toMatchObject({
      deliveryFeeAmount: 5000,
      zone: {
        id: 'zone-1'
      }
    });
  });

  it('rejects invalid zone input', () => {
    expect(() =>
      assertDeliveryZoneInput({
        name: '',
        feeAmount: -1
      })
    ).toThrow();
  });
});
