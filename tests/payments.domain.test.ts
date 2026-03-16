import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import {
  assertPaymentIntentTransition,
  createMockMomoProvider,
  createFlutterwaveTxRef,
  createPaymentRequestHash,
  CustomerEmail,
  CustomerPhone,
  FlutterwaveNetwork,
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

  it('accepts valid customer email and supported mobile money networks', () => {
    expect(CustomerEmail.parse(' shopper@example.com ').toString()).toBe('shopper@example.com');
    expect(FlutterwaveNetwork.parse('mtn').toString()).toBe('MTN');
    expect(() => CustomerEmail.parse('not-an-email')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.PaymentProviderRejectedRequest
      })
    );
    expect(() => FlutterwaveNetwork.parse('vodafone')).toThrowError(
      expect.objectContaining({
        code: ErrorCode.PaymentProviderRejectedRequest
      })
    );
  });

  it('produces deterministic payment idempotency hashes', () => {
    const left = createPaymentRequestHash({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      method: 'mobile_money',
      provider: 'flutterwave',
      customerPhoneE164: '+256712345678',
      customerEmail: 'shopper@example.com',
      network: 'MTN'
    });
    const right = createPaymentRequestHash({
      tenantId: 'tenant-1',
      orderId: 'order-1',
      method: 'mobile_money',
      provider: 'flutterwave',
      customerPhoneE164: '+256712345678',
      customerEmail: 'shopper@example.com',
      network: 'MTN'
    });

    expect(left).toBe(right);
  });

  it('builds deterministic flutterwave transaction references', () => {
    expect(
      createFlutterwaveTxRef({
        tenantId: 'tenant-1',
        orderId: 'order-1',
        paymentIntentId: 'pi-1',
        now: new Date('2026-03-17T10:00:00.000Z')
      })
    ).toBe('t:tenant-1:o:order-1:pi:pi-1:ts:1773741600');
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
