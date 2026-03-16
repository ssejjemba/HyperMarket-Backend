import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../errors/PaymentError';
import type {
  PaymentProvider,
  ProviderCreateIntentInput,
  ProviderCreateIntentResult,
  ProviderStatusResult,
  ProviderWebhookEvent,
  ProviderWebhookHttpRequest
} from './PaymentProvider';

type MockMomoWebhookBody = {
  provider_event_id: string;
  provider_reference: string;
  status: 'pending' | 'awaiting_customer' | 'succeeded' | 'failed' | 'expired';
  amount?: number;
  currency?: string;
  occurred_at?: string;
};

const signBody = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

const getBodyText = (body: unknown): string => {
  if (typeof body === 'string') {
    return body;
  }

  return JSON.stringify(body);
};

const parseWebhookBody = (body: unknown): MockMomoWebhookBody => {
  if (body === null || typeof body !== 'object') {
    throw new PaymentError({
      code: ErrorCode.PaymentWebhookParseFailed,
      message: 'Webhook payload must be an object'
    });
  }

  const candidate = body as Record<string, unknown>;
  const providerEventId = candidate.provider_event_id;
  const providerReference = candidate.provider_reference;
  const status = candidate.status;

  if (
    typeof providerEventId !== 'string' ||
    typeof providerReference !== 'string' ||
    (status !== 'pending' &&
      status !== 'awaiting_customer' &&
      status !== 'succeeded' &&
      status !== 'failed' &&
      status !== 'expired')
  ) {
    throw new PaymentError({
      code: ErrorCode.PaymentWebhookParseFailed,
      message: 'Webhook payload is missing required fields'
    });
  }

  return {
    provider_event_id: providerEventId,
    provider_reference: providerReference,
    status,
    ...(typeof candidate.amount === 'number' ? { amount: candidate.amount } : {}),
    ...(typeof candidate.currency === 'string' ? { currency: candidate.currency } : {}),
    ...(typeof candidate.occurred_at === 'string' ? { occurred_at: candidate.occurred_at } : {})
  };
};

export const createMockMomoProvider = (input: { webhookSecret: string }): PaymentProvider => {
  if (input.webhookSecret.trim().length === 0) {
    throw new PaymentError({
      code: ErrorCode.PaymentProviderConfigInvalid,
      message: 'PAYMENT_MOCK_WEBHOOK_SECRET is required'
    });
  }

  const providerName = 'mock_momo';

  return {
    providerName,

    async createIntent(payload: ProviderCreateIntentInput): Promise<ProviderCreateIntentResult> {
      return {
        providerReference: `${providerName}_${payload.intentId}`,
        status: 'awaiting_customer',
        nextAction: {
          type: 'display_message',
          message: 'Mobile money prompt sent'
        },
        raw: {
          provider_reference: `${providerName}_${payload.intentId}`,
          accepted: true
        }
      };
    },

    verifyWebhookSignature(request: ProviderWebhookHttpRequest): void {
      const signatureHeader = request.headers['x-mock-momo-signature'];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      if (typeof signature !== 'string' || signature.length === 0) {
        throw new PaymentError({
          code: ErrorCode.PaymentWebhookSignatureInvalid,
          message: 'Missing mock provider webhook signature'
        });
      }

      const expected = signBody(input.webhookSecret, getBodyText(request.body));
      const received = Buffer.from(signature, 'utf8');
      const expectedBuffer = Buffer.from(expected, 'utf8');

      if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
        throw new PaymentError({
          code: ErrorCode.PaymentWebhookSignatureInvalid,
          message: 'Invalid mock provider webhook signature'
        });
      }
    },

    parseWebhook(request: ProviderWebhookHttpRequest): ProviderWebhookEvent {
      const body = parseWebhookBody(request.body);

      return {
        providerEventId: body.provider_event_id,
        providerReference: body.provider_reference,
        status: body.status,
        amount: body.amount ?? null,
        currency: body.currency ?? null,
        occurredAt: body.occurred_at === undefined ? new Date() : new Date(body.occurred_at),
        payload: {
          provider_event_id: body.provider_event_id,
          provider_reference: body.provider_reference,
          status: body.status,
          amount: body.amount ?? null,
          currency: body.currency ?? null
        }
      };
    },

    async getIntentStatus(providerReference: string): Promise<ProviderStatusResult> {
      return {
        providerReference,
        status: 'awaiting_customer',
        amount: null,
        currency: null,
        payload: {
          provider_reference: providerReference,
          status: 'awaiting_customer',
          reconciliation_token: randomUUID()
        }
      };
    }
  };
};

export const signMockMomoWebhook = (input: {
  secret: string;
  body: Record<string, unknown>;
}): string => signBody(input.secret, JSON.stringify(input.body));
