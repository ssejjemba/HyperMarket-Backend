import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import {
  EmailRecipient,
  SmsRecipient,
  createNotificationDedupeKey,
  maskNotificationRecipient,
  renderNotificationTemplate
} from '@hypermarket/modules/notifications';

describe('NOT domain primitives', () => {
  it('creates deterministic dedupe keys', () => {
    const left = createNotificationDedupeKey({
      tenantId: 'tenant-1',
      channel: 'sms',
      templateId: 'order.created.customer',
      templateVersion: 1,
      recipient: '+256712345678',
      eventId: 'event-1'
    });
    const right = createNotificationDedupeKey({
      tenantId: 'tenant-1',
      channel: 'sms',
      templateId: 'order.created.customer',
      templateVersion: 1,
      recipient: '+256712345678',
      eventId: 'event-1'
    });

    expect(left).toBe(right);
  });

  it('validates sms and email recipients loudly', () => {
    expect(SmsRecipient.parse('+256712345678').toString()).toBe('+256712345678');
    expect(EmailRecipient.parse('owner@example.com').toString()).toBe('owner@example.com');
    expect(() => SmsRecipient.parse('+12025550123')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.NotRecipientInvalid
      })
    );
    expect(() => EmailRecipient.parse('bad-email')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.NotRecipientInvalid
      })
    );
  });

  it('masks notification recipients safely', () => {
    expect(maskNotificationRecipient('+256712345678')).toContain('***');
    expect(maskNotificationRecipient('owner@example.com')).toBe('o***@example.com');
  });

  it('renders typed notification templates', () => {
    expect(
      renderNotificationTemplate({
        channel: 'sms',
        templateId: 'order.created.customer',
        templateVersion: 1,
        payload: {
          order_number: 101,
          total_amount: 5000,
          currency: 'UGX',
          store_name: 'Sunrise Fresh',
          fulfillment_type: 'pickup',
          created_at: '2026-03-17T00:00:00.000Z'
        }
      })
    ).toMatchObject({
      text: expect.stringContaining('Order #101 confirmed')
    });
  });

  it('fails loudly on invalid template payloads', () => {
    expect(() =>
      renderNotificationTemplate({
        channel: 'sms',
        templateId: 'payment.succeeded.customer',
        templateVersion: 1,
        payload: {
          store_name: 'Sunrise Fresh'
        }
      })
    ).toThrowError(
      expect.objectContaining({
        code: ErrorCode.NotTemplatePayloadInvalid
      })
    );
  });
});
