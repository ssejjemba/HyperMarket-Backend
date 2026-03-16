import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../errors/PaymentError';
import type {
  PaymentIntentProviderStatus,
  PaymentProvider,
  ProviderCreateIntentInput,
  ProviderCreateIntentResult,
  ProviderStatusResult,
  ProviderWebhookEvent,
  ProviderWebhookHttpRequest
} from './PaymentProvider';

type FlutterwaveProviderConfig = {
  secretKey: string;
  webhookSecretHash: string;
  baseUrl: string;
  timeoutMs?: number | undefined;
};

type HttpRequest = {
  method: 'POST' | 'GET';
  url: string;
  headers: Record<string, string>;
  body?: string | undefined;
  timeoutMs: number;
};

type HttpResponse = {
  status: number;
  json: unknown;
};

export type FlutterwaveHttpClient = (request: HttpRequest) => Promise<HttpResponse>;

type FlutterwaveChargeResponse = {
  status?: string;
  message?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    flw_ref?: string;
    status?: string;
  };
};

type FlutterwaveVerifyResponse = {
  status?: string;
  message?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    flw_ref?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
};

type FlutterwaveWebhookBody = {
  event?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    flw_ref?: string;
    status?: string;
    amount?: number;
    currency?: string;
    created_at?: string;
  };
};

const DEFAULT_TIMEOUT_MS = 10_000;

const createDefaultHttpClient = (): FlutterwaveHttpClient => {
  return async (request) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body !== undefined ? { body: request.body } : {}),
        signal: controller.signal
      });
      const text = await response.text();
      let json: unknown = {};

      if (text !== '') {
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          json = { message: text };
        }
      }

      return {
        status: response.status,
        json
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new PaymentError({
          code: ErrorCode.PaymentProviderUnavailable,
          message: 'Flutterwave request timed out',
          cause: error
        });
      }

      throw new PaymentError({
        code: ErrorCode.PaymentProviderUnavailable,
        message: 'Flutterwave request failed',
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  };
};

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return value as Record<string, unknown>;
};

const parseProviderStatus = (input: string | undefined): PaymentIntentProviderStatus => {
  switch ((input ?? '').toLowerCase()) {
    case 'successful':
    case 'success':
      return 'succeeded';
    case 'failed':
    case 'error':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'pending':
      return 'pending';
    default:
      return 'awaiting_customer';
  }
};

const mapProviderError = (status: number, body: Record<string, unknown>): never => {
  if (status === 401 || status === 403) {
    throw new PaymentError({
      code: ErrorCode.PaymentProviderAuthFailed,
      message: 'Flutterwave authentication failed',
      details: body
    });
  }

  if (status === 429) {
    throw new PaymentError({
      code: ErrorCode.PaymentProviderRateLimited,
      message: 'Flutterwave rate limited the request',
      details: body
    });
  }

  if (status >= 400 && status < 500) {
    throw new PaymentError({
      code: ErrorCode.PaymentProviderRejectedRequest,
      message: 'Flutterwave rejected the payment request',
      details: body
    });
  }

  throw new PaymentError({
    code: ErrorCode.PaymentProviderUnavailable,
    message: 'Flutterwave is unavailable',
    details: body
  });
};

const parseWebhookBody = (body: unknown): Required<FlutterwaveWebhookBody> => {
  const candidate = asObject(body);
  const event = candidate.event;
  const data = asObject(candidate.data);
  const txRef = data.tx_ref;
  const transactionId = data.id;

  if (typeof event !== 'string' || typeof txRef !== 'string') {
    throw new PaymentError({
      code: ErrorCode.PaymentWebhookParseFailed,
      message: 'Flutterwave webhook payload is missing required fields'
    });
  }

  return {
    event,
    data: {
      ...(typeof transactionId === 'number' || typeof transactionId === 'string'
        ? { id: transactionId }
        : {}),
      tx_ref: txRef,
      ...(typeof data.flw_ref === 'string' ? { flw_ref: data.flw_ref } : {}),
      ...(typeof data.status === 'string' ? { status: data.status } : {}),
      ...(typeof data.amount === 'number' ? { amount: data.amount } : {}),
      ...(typeof data.currency === 'string' ? { currency: data.currency } : {}),
      ...(typeof data.created_at === 'string' ? { created_at: data.created_at } : {})
    }
  };
};

export const createFlutterwaveProvider = (
  config: FlutterwaveProviderConfig,
  deps: { httpClient?: FlutterwaveHttpClient | undefined } = {}
): PaymentProvider => {
  if (config.secretKey.trim().length === 0) {
    throw new PaymentError({
      code: ErrorCode.PaymentProviderConfigInvalid,
      message: 'FLW_SECRET_KEY is required'
    });
  }

  if (config.webhookSecretHash.trim().length === 0) {
    throw new PaymentError({
      code: ErrorCode.PaymentProviderConfigInvalid,
      message: 'FLW_WEBHOOK_SECRET_HASH is required'
    });
  }

  const httpClient = deps.httpClient ?? createDefaultHttpClient();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  const request = async (input: HttpRequest): Promise<Record<string, unknown>> => {
    const response = await httpClient(input);
    const body = asObject(response.json);
    if (response.status < 200 || response.status >= 300) {
      mapProviderError(response.status, body);
    }

    return body;
  };

  return {
    providerName: 'flutterwave',

    async createIntent(input: ProviderCreateIntentInput): Promise<ProviderCreateIntentResult> {
      if (input.txRef === undefined || input.txRef.trim().length === 0) {
        throw new PaymentError({
          code: ErrorCode.PaymentProviderRejectedRequest,
          message: 'Flutterwave requests require tx_ref'
        });
      }

      if (input.customerEmail === undefined || input.customerEmail.trim().length === 0) {
        throw new PaymentError({
          code: ErrorCode.PaymentProviderRejectedRequest,
          message: 'Flutterwave requests require customer email'
        });
      }

      if (input.network === undefined || input.network.trim().length === 0) {
        throw new PaymentError({
          code: ErrorCode.PaymentProviderRejectedRequest,
          message: 'Flutterwave requests require a network'
        });
      }

      const raw = (await request({
        method: 'POST',
        url: `${baseUrl}/v3/charges?type=mobile_money_uganda`,
        headers: {
          authorization: `Bearer ${config.secretKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          tx_ref: input.txRef,
          amount: input.amount,
          currency: input.currency,
          email: input.customerEmail,
          phone_number: input.customerPhoneE164,
          network: input.network
        }),
        timeoutMs
      })) as FlutterwaveChargeResponse;

      const txRef = raw.data?.tx_ref ?? input.txRef;
      const transactionId = raw.data?.id === undefined ? null : String(raw.data.id);

      return {
        providerReference: txRef,
        providerTransactionId: transactionId,
        status: parseProviderStatus(raw.data?.status),
        nextAction: {
          type: 'display_message',
          message: 'Mobile money prompt initiated'
        },
        raw: asObject(raw)
      };
    },

    verifyWebhookSignature(requestPayload: ProviderWebhookHttpRequest): void {
      const hashHeader = requestPayload.headers['verif-hash'];
      const hash = Array.isArray(hashHeader) ? hashHeader[0] : hashHeader;

      if (typeof hash !== 'string' || hash.length === 0) {
        throw new PaymentError({
          code: ErrorCode.PaymentWebhookHashMissing,
          message: 'Missing Flutterwave webhook hash'
        });
      }

      if (hash !== config.webhookSecretHash) {
        throw new PaymentError({
          code: ErrorCode.PaymentWebhookHashMismatch,
          message: 'Flutterwave webhook hash mismatch'
        });
      }
    },

    parseWebhook(requestPayload: ProviderWebhookHttpRequest): ProviderWebhookEvent {
      const body = parseWebhookBody(requestPayload.body);
      const txRef = body.data.tx_ref ?? '';
      const transactionId = body.data.id === undefined ? null : String(body.data.id);
      const providerEventId =
        transactionId === null ? `${body.event}:${txRef}` : `${body.event}:${transactionId}`;

      return {
        providerEventId,
        providerReference: txRef,
        providerTransactionId: transactionId,
        txRef,
        status: parseProviderStatus(body.data.status),
        amount: body.data.amount ?? null,
        currency: body.data.currency ?? null,
        occurredAt:
          body.data.created_at === undefined ? new Date() : new Date(body.data.created_at),
        payload: {
          event: body.event,
          tx_ref: txRef,
          transaction_id: transactionId,
          status: body.data.status ?? null,
          amount: body.data.amount ?? null,
          currency: body.data.currency ?? null
        }
      };
    },

    async getIntentStatus(providerReference: string): Promise<ProviderStatusResult> {
      const url = new URL(`${baseUrl}/v3/transactions/verify_by_reference`);
      url.searchParams.set('tx_ref', providerReference);
      const raw = (await request({
        method: 'GET',
        url: url.toString(),
        headers: {
          authorization: `Bearer ${config.secretKey}`
        },
        timeoutMs
      })) as FlutterwaveVerifyResponse;

      const txRef = raw.data?.tx_ref ?? providerReference;
      return {
        providerReference: txRef,
        providerTransactionId: raw.data?.id === undefined ? null : String(raw.data.id),
        txRef,
        status: parseProviderStatus(raw.data?.status),
        amount: raw.data?.amount ?? null,
        currency: raw.data?.currency ?? null,
        payload: asObject(raw)
      };
    }
  };
};
