import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type PaymentErrorCode =
  | ErrorCode.PaymentProviderConfigInvalid
  | ErrorCode.PaymentProviderUnavailable
  | ErrorCode.PaymentPhoneInvalid
  | ErrorCode.PaymentOrderNotFound
  | ErrorCode.PaymentOrderNotPayable
  | ErrorCode.PaymentIntentNotFound
  | ErrorCode.PaymentInvalidStateTransition
  | ErrorCode.PaymentWebhookSignatureInvalid
  | ErrorCode.PaymentWebhookParseFailed
  | ErrorCode.PaymentIdempotencyConflict
  | ErrorCode.PaymentReconciliationFailed
  | ErrorCode.PaymentDbFailure;

type PaymentErrorParams = {
  code: PaymentErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class PaymentError extends AppError {
  declare readonly code: PaymentErrorCode;

  constructor(params: PaymentErrorParams) {
    super(params);
    this.name = 'PaymentError';
  }
}
