import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import {
  buildFulfillmentSnapshot,
  computeOrderLine,
  computeOrderTotals,
  createOrderRequestHash,
  OrderError,
  resolveMerchantOrderAction
} from '@hypermarket/modules/orders';

describe('ORD domain rules', () => {
  it('allows valid merchant state transitions and blocks invalid ones', () => {
    expect(resolveMerchantOrderAction('PENDING', 'confirm')).toBe('CONFIRMED');
    expect(() => resolveMerchantOrderAction('PAID', 'cancel')).toThrowError(OrderError);
    expect(() => resolveMerchantOrderAction('PAID', 'cancel')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.OrderInvalidStateTransition
      })
    );
  });

  it('computes line totals and order totals from authoritative prices', () => {
    expect(computeOrderLine({ quantity: 2, unitPriceAmount: 3500 })).toEqual({
      quantity: 2,
      unitPriceAmount: 3500,
      lineTotalAmount: 7000
    });

    expect(
      computeOrderTotals(
        [
          { quantity: 2, unitPriceAmount: 3500 },
          { quantity: 1, unitPriceAmount: 1800 }
        ],
        2000
      )
    ).toEqual({
      subtotalAmount: 8800,
      deliveryFeeAmount: 2000,
      discountAmount: 0,
      totalAmount: 10800
    });
  });

  it('rejects invalid quantities loudly', () => {
    expect(() => computeOrderLine({ quantity: 0, unitPriceAmount: 3500 })).toThrowError(
      expect.objectContaining({
        code: ErrorCode.OrderQuantityInvalid
      })
    );
  });

  it('validates pickup and delivery fulfillment snapshots', () => {
    expect(
      buildFulfillmentSnapshot(
        {
          type: 'pickup',
          pickup_location_label: 'Acacia Mall'
        },
        {
          deliveryFeeAmount: 0
        }
      )
    ).toEqual({
      type: 'pickup',
      pickup_location_label: 'Acacia Mall',
      instructions: null
    });

    expect(
      buildFulfillmentSnapshot(
        {
          type: 'delivery',
          zone_name: 'Central Kampala',
          address_label: 'Plot 12 Yusuf Lule Road',
          recipient_name: 'Amina',
          recipient_phone: '+256700000001'
        },
        {
          deliveryFeeAmount: 5000
        }
      )
    ).toEqual({
      type: 'delivery',
      zone_id: null,
      zone_name: 'Central Kampala',
      delivery_fee_amount: 5000,
      address_label: 'Plot 12 Yusuf Lule Road',
      location_hint: null,
      recipient_name: 'Amina',
      recipient_phone: '+256700000001',
      instructions: null
    });

    expect(() =>
      buildFulfillmentSnapshot(
        {
          type: 'delivery',
          address_label: 'Plot 12 Yusuf Lule Road',
          recipient_name: 'Amina',
          recipient_phone: '+256700000001'
        } as never,
        {
          deliveryFeeAmount: 5000
        }
      )
    ).toThrowError(
      expect.objectContaining({
        code: ErrorCode.OrderFulfillmentInvalid
      })
    );
  });

  it('produces deterministic idempotency hashes for equivalent payloads', () => {
    const left = createOrderRequestHash({
      tenantId: 'tenant-1',
      checkoutMode: 'pay_on_delivery',
      items: [
        {
          quantity: 2,
          product_id: 'product-1'
        }
      ],
      customer: {
        phone_e164: '+256700000001',
        full_name: 'Amina'
      },
      fulfillment: {
        type: 'pickup',
        pickup_location_label: 'Acacia Mall'
      }
    });

    const right = createOrderRequestHash({
      tenantId: 'tenant-1',
      checkoutMode: 'pay_on_delivery',
      items: [
        {
          product_id: 'product-1',
          quantity: 2
        }
      ],
      customer: {
        full_name: 'Amina',
        phone_e164: '+256700000001'
      },
      fulfillment: {
        pickup_location_label: 'Acacia Mall',
        type: 'pickup'
      }
    });

    expect(left).toBe(right);
  });
});
