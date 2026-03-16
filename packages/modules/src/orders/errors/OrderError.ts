import { AppError } from '@hypermarket/contracts';
import type { ErrorCode } from '@hypermarket/contracts';

export type OrderErrorCode =
  | ErrorCode.OrderIdempotencyConflict
  | ErrorCode.OrderInvalidItems
  | ErrorCode.OrderProductNotFound
  | ErrorCode.OrderVariantNotFound
  | ErrorCode.OrderProductNotAvailable
  | ErrorCode.OrderQuantityInvalid
  | ErrorCode.OrderFulfillmentInvalid
  | ErrorCode.OrderTotalMismatchInternal
  | ErrorCode.OrderInvalidStateTransition
  | ErrorCode.OrderNotFound
  | ErrorCode.OrderValidationFailed;

type OrderErrorParams = {
  code: OrderErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class OrderError extends AppError {
  declare readonly code: OrderErrorCode;

  constructor(params: OrderErrorParams) {
    super(params);
    this.name = 'OrderError';
  }

  static is(error: unknown): error is OrderError {
    return error instanceof OrderError;
  }
}
