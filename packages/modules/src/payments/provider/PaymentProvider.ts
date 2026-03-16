export type PaymentMethod = 'mobile_money' | 'card' | 'bank';

export type PaymentIntentProviderStatus =
  | 'pending'
  | 'awaiting_customer'
  | 'succeeded'
  | 'failed'
  | 'expired';

export type ProviderCreateIntentInput = {
  tenantId: string;
  intentId: string;
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  txRef?: string;
  customerPhoneE164: string | null;
  customerEmail?: string;
  network?: string;
  webhookUrl: string;
};

export type ProviderCreateIntentResult = {
  providerReference: string;
  providerTransactionId?: string | null;
  status: PaymentIntentProviderStatus;
  nextAction:
    | {
        type: 'display_message';
        message: string;
      }
    | {
        type: 'none';
      };
  raw: Record<string, unknown>;
};

export type ProviderWebhookHttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

export type ProviderWebhookEvent = {
  providerEventId: string;
  providerReference: string;
  providerTransactionId: string | null;
  txRef: string;
  status: PaymentIntentProviderStatus;
  amount: number | null;
  currency: string | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export type ProviderStatusResult = {
  providerReference: string;
  providerTransactionId: string | null;
  txRef: string;
  status: PaymentIntentProviderStatus;
  amount: number | null;
  currency: string | null;
  payload: Record<string, unknown>;
};

export type PaymentProvider = {
  readonly providerName: string;
  createIntent: (input: ProviderCreateIntentInput) => Promise<ProviderCreateIntentResult>;
  verifyWebhookSignature: (request: ProviderWebhookHttpRequest) => void;
  parseWebhook: (request: ProviderWebhookHttpRequest) => ProviderWebhookEvent;
  getIntentStatus: (providerReference: string) => Promise<ProviderStatusResult>;
};
