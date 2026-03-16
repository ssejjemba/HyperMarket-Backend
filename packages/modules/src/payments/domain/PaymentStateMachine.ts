import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../errors/PaymentError';

export const PAYMENT_INTENT_STATUSES = [
  'CREATED',
  'PENDING_PROVIDER',
  'AWAITING_CUSTOMER',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED'
] as const;

export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  CREATED: ['PENDING_PROVIDER', 'CANCELLED'],
  PENDING_PROVIDER: ['AWAITING_CUSTOMER', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  AWAITING_CUSTOMER: ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: []
};

export const assertPaymentIntentTransition = (
  fromStatus: PaymentIntentStatus,
  toStatus: PaymentIntentStatus
): PaymentIntentStatus => {
  if (!ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
    throw new PaymentError({
      code: ErrorCode.PaymentInvalidStateTransition,
      message: `Cannot transition payment intent from ${fromStatus} to ${toStatus}`,
      details: {
        from_status: fromStatus,
        to_status: toStatus
      }
    });
  }

  return toStatus;
};
