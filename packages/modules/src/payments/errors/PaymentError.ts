import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type PaymentErrorCode =
  | ErrorCode.PaymentProviderConfigInvalid
  | ErrorCode.PaymentProviderUnavailable
  | ErrorCode.PaymentProviderRejectedRequest
  | ErrorCode.PaymentProviderRateLimited
  | ErrorCode.PaymentProviderAuthFailed
  | ErrorCode.PaymentPhoneInvalid
  | ErrorCode.PaymentOrderNotFound
  | ErrorCode.PaymentOrderNotPayable
  | ErrorCode.PaymentIntentNotFound
  | ErrorCode.PaymentInvalidStateTransition
  | ErrorCode.PaymentWebhookSignatureInvalid
  | ErrorCode.PaymentWebhookHashMissing
  | ErrorCode.PaymentWebhookHashMismatch
  | ErrorCode.PaymentWebhookParseFailed
  | ErrorCode.PaymentIdempotencyConflict
  | ErrorCode.PaymentTransactionVerificationFailed
  | ErrorCode.PaymentTransactionMismatch
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
