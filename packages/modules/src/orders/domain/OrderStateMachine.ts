import { ErrorCode } from '@hypermarket/contracts';

import { OrderError } from '../errors/OrderError';

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'PAID',
  'FAILED',
  'FULFILLED',
  'REFUNDED'
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MERCHANT_ORDER_ACTIONS = ['confirm', 'cancel', 'fulfill'] as const;
export type MerchantOrderAction = (typeof MERCHANT_ORDER_ACTIONS)[number];

const ACTION_TARGETS: Record<MerchantOrderAction, OrderStatus> = {
  confirm: 'CONFIRMED',
  cancel: 'CANCELLED',
  fulfill: 'FULFILLED'
};

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'PAID', 'FAILED'],
  CONFIRMED: ['PAID', 'FULFILLED'],
  CANCELLED: [],
  PAID: ['REFUNDED'],
  FAILED: [],
  FULFILLED: [],
  REFUNDED: []
};

export const assertOrderTransition = (
  fromStatus: OrderStatus,
  toStatus: OrderStatus
): OrderStatus => {
  if (!ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
    throw new OrderError({
      code: ErrorCode.OrderInvalidStateTransition,
      message: `Cannot transition order from ${fromStatus} to ${toStatus}`,
      details: {
        from_status: fromStatus,
        to_status: toStatus
      }
    });
  }

  return toStatus;
};

export const resolveMerchantOrderAction = (
  currentStatus: OrderStatus,
  action: MerchantOrderAction
): OrderStatus => assertOrderTransition(currentStatus, ACTION_TARGETS[action]);
