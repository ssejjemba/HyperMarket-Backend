import type { PaymentIntentRecord } from '../../persistence/PaymentRepoPg';

export const mapPaymentIntentDto = (
  intent: PaymentIntentRecord & {
    nextAction?: {
      type: 'display_message' | 'none';
      message?: string;
    };
  }
) => ({
  id: intent.id,
  tenant_id: intent.tenantId,
  order_id: intent.orderId,
  provider: intent.provider,
  method: intent.method,
  status: intent.status,
  amount: intent.amount,
  currency: intent.currency,
  tx_ref: intent.txRef,
  provider_reference: intent.providerReference,
  provider_transaction_id: intent.providerTransactionId,
  customer_phone_e164: intent.customerPhoneE164,
  customer_email: intent.customerEmail,
  network: intent.network,
  failure_code: intent.failureCode,
  failure_message: intent.failureMessage,
  created_at: intent.createdAt.toISOString(),
  updated_at: intent.updatedAt.toISOString(),
  next_action: intent.nextAction ?? null
});
