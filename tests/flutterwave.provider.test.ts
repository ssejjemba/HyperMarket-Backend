import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { createFlutterwaveProvider } from '@hypermarket/modules/payments';

describe('Flutterwave provider adapter', () => {
  it('creates Uganda mobile money intents with tx ref, email and network', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    const provider = createFlutterwaveProvider(
      {
        secretKey: 'FLWSECK_TEST',
        webhookSecretHash: 'test-hash',
        baseUrl: 'https://api.flutterwave.com'
      },
      {
        httpClient: async (request) => {
          requests.push({
            url: request.url,
            ...(request.body !== undefined ? { body: request.body } : {})
          });

          return {
            status: 200,
            json: {
              status: 'success',
              data: {
                id: 12345,
                tx_ref: 't:tenant:o:order:pi:intent:ts:1',
                status: 'pending'
              }
            }
          };
        }
      }
    );

    await expect(
      provider.createIntent({
        tenantId: 'tenant',
        intentId: 'intent',
        orderId: 'order',
        amount: 3500,
        currency: 'UGX',
        method: 'mobile_money',
        txRef: 't:tenant:o:order:pi:intent:ts:1',
        customerPhoneE164: '+256712345678',
        customerEmail: 'shopper@example.com',
        network: 'MTN',
        webhookUrl: 'https://example.com/payments/webhooks/flutterwave'
      })
    ).resolves.toMatchObject({
      providerReference: 't:tenant:o:order:pi:intent:ts:1',
      providerTransactionId: '12345',
      status: 'awaiting_customer'
    });

    expect(requests[0]?.url).toBe(
      'https://api.flutterwave.com/v3/charges?type=mobile_money_uganda'
    );
    expect(JSON.parse(requests[0]?.body ?? '{}')).toMatchObject({
      tx_ref: 't:tenant:o:order:pi:intent:ts:1',
      email: 'shopper@example.com',
      network: 'MTN',
      phone_number: '+256712345678'
    });
  });

  it('verifies webhook hash and parses normalized events', () => {
    const provider = createFlutterwaveProvider({
      secretKey: 'FLWSECK_TEST',
      webhookSecretHash: 'test-hash',
      baseUrl: 'https://api.flutterwave.com'
    });
    const body = {
      event: 'charge.completed',
      data: {
        id: 9988,
        tx_ref: 't:tenant:o:order:pi:intent:ts:1',
        status: 'successful',
        amount: 3500,
        currency: 'UGX',
        created_at: '2026-03-17T10:00:00.000Z'
      }
    };

    provider.verifyWebhookSignature({
      headers: {
        'verif-hash': 'test-hash'
      },
      body
    });

    expect(provider.parseWebhook({ headers: {}, body })).toMatchObject({
      providerEventId: 'charge.completed:9988',
      providerReference: 't:tenant:o:order:pi:intent:ts:1',
      providerTransactionId: '9988',
      txRef: 't:tenant:o:order:pi:intent:ts:1',
      status: 'succeeded'
    });
  });

  it('maps missing webhook hash to a stable payment error', () => {
    const provider = createFlutterwaveProvider({
      secretKey: 'FLWSECK_TEST',
      webhookSecretHash: 'test-hash',
      baseUrl: 'https://api.flutterwave.com'
    });

    expect(() =>
      provider.verifyWebhookSignature({
        headers: {},
        body: {}
      })
    ).toThrowError(
      expect.objectContaining({
        code: ErrorCode.PaymentWebhookHashMissing
      })
    );
  });
});
