import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import {
  assertPaymentIntentTransition,
  createMockMomoProvider,
  createPaymentRequestHash,
  CustomerPhone,
  PaymentError,
  signMockMomoWebhook
} from '@hypermarket/modules/payments';

describe('PAY domain rules', () => {
  it('allows valid intent transitions and blocks invalid ones', () => {
    expect(assertPaymentIntentTransition('CREATED', 'PENDING_PROVIDER')).toBe('PENDING_PROVIDER');
    expect(() => assertPaymentIntentTransition('SUCCEEDED', 'FAILED')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.PaymentInvalidStateTransition
      })
    );
  });

  it('accepts valid ugandan customer phones and rejects unsupported numbers', () => {
    expect(CustomerPhone.parse('+256712345678').toE164()).toBe('+256712345678');
    expect(() => CustomerPhone.parse('+12025550123')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.PaymentPhoneInvalid
      })
    );
  });

  it('produces deterministic payment idempotency hashes', () => {
    const left = createPaymentRequestHash({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      method: 'mobile_money',
      provider: 'mock_momo',
      customerPhoneE164: '+256712345678'
    });
    const right = createPaymentRequestHash({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      method: 'mobile_money',
      provider: 'mock_momo',
      customerPhoneE164: '+256712345678'
    });

    expect(left).toBe(right);
  });

  it('verifies and parses mock momo webhooks', async () => {
    const provider = createMockMomoProvider({
      webhookSecret: 'mock-secret'
    });
    const body = {
      provider_event_id: 'evt_1',
      provider_reference: 'mock_momo_pi_1',
      status: 'succeeded',
      amount: 3500,
      currency: 'UGX',
      occurred_at: '2026-03-16T00:00:00.000Z'
    };

    provider.verifyWebhookSignature({
      headers: {
        'x-mock-momo-signature': signMockMomoWebhook({
          secret: 'mock-secret',
          body
        })
      },
      body
    });

    expect(provider.parseWebhook({ headers: {}, body })).toMatchObject({
      providerEventId: 'evt_1',
      providerReference: 'mock_momo_pi_1',
      status: 'succeeded'
    });

    await expect(
      provider.createIntent({
        tenantId: 'tenant-1',
        intentId: 'pi_1',
        orderId: 'order-1',
        amount: 3500,
        currency: 'UGX',
        method: 'mobile_money',
        customerPhoneE164: '+256712345678',
        webhookUrl: 'https://example.com/payments/webhooks/mock_momo'
      })
    ).resolves.toMatchObject({
      status: 'awaiting_customer'
    });
  });

  it('fails loudly on invalid webhook signatures', () => {
    const provider = createMockMomoProvider({
      webhookSecret: 'mock-secret'
    });

    expect(() =>
      provider.verifyWebhookSignature({
        headers: {
          'x-mock-momo-signature': 'bad-signature'
        },
        body: {
          provider_event_id: 'evt_1',
          provider_reference: 'mock_momo_pi_1',
          status: 'succeeded'
        }
      })
    ).toThrowError(PaymentError);
  });
});
