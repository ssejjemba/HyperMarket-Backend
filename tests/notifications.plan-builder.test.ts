import { describe, expect, it } from 'vitest';

import type { OutboxRecord } from '@hypermarket/core';
import { buildNotificationPlan } from '@hypermarket/modules/notifications';

const createOutboxEvent = (input: {
  eventType: string;
  payload: Record<string, unknown>;
}): OutboxRecord => ({
  id: 'outbox-1',
  eventType: input.eventType,
  tenantId: 'tenant-1',
  correlationId: null,
  actorUserId: null,
  payload: input.payload,
  occurredAt: new Date('2026-03-17T00:00:00.000Z'),
  availableAt: new Date('2026-03-17T00:00:00.000Z'),
  dispatchedAt: null,
  attempts: 0,
  lastError: null,
  createdAt: new Date('2026-03-17T00:00:00.000Z')
});

describe('NOT notification plan builder', () => {
  it('maps order created to customer and merchant sms notifications', () => {
    const plan = buildNotificationPlan(
      createOutboxEvent({
        eventType: 'Order.Created',
        payload: {
          order_number: 101,
          total_amount: 15000,
          currency: 'UGX',
          store_name: 'Sunrise Fresh',
          fulfillment_type: 'pickup',
          customer: {
            phone_e164: '+256712345678'
          },
          merchant_phone_e164: '+256772345678'
        }
      })
    );

    expect(plan).toHaveLength(2);
    expect(plan.map((item) => item.templateId)).toEqual([
      'order.created.customer',
      'order.created.merchant'
    ]);
  });

  it('maps payment success to customer and merchant sms notifications', () => {
    const plan = buildNotificationPlan(
      createOutboxEvent({
        eventType: 'Payment.Succeeded',
        payload: {
          order_number: 202,
          total_amount: 22000,
          currency: 'UGX',
          store_name: 'Sunrise Fresh',
          customer_phone_e164: '+256712345678',
          merchant_phone_e164: '+256772345678'
        }
      })
    );

    expect(plan).toHaveLength(2);
    expect(plan.map((item) => item.templateId)).toEqual([
      'payment.succeeded.customer',
      'payment.succeeded.merchant'
    ]);
  });

  it('skips invalid or missing recipients', () => {
    const plan = buildNotificationPlan(
      createOutboxEvent({
        eventType: 'Payment.Failed',
        payload: {
          order_number: 303,
          store_name: 'Sunrise Fresh',
          customer_phone_e164: 'bad-phone'
        }
      })
    );

    expect(plan).toHaveLength(0);
  });

  it('ignores rollback notifications in mvp', () => {
    const plan = buildNotificationPlan(
      createOutboxEvent({
        eventType: 'Rollback.Completed',
        payload: {
          merchant_phone_e164: '+256772345678'
        }
      })
    );

    expect(plan).toHaveLength(0);
  });
});
