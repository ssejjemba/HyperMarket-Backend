import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';

export const registerOrderRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {};

export { OrderError } from './errors/OrderError';
export type { OrderErrorCode } from './errors/OrderError';
export {
  assertOrderTransition,
  buildFulfillmentSnapshot,
  computeOrderLine,
  computeOrderTotals,
  createOrderRequestHash,
  MERCHANT_ORDER_ACTIONS,
  ORDER_STATUSES,
  resolveMerchantOrderAction
} from './domain';
export type {
  FulfillmentInput,
  FulfillmentSnapshot,
  MerchantOrderAction,
  OrderComputedLine,
  OrderPricedItem,
  OrderStatus,
  OrderTotals
} from './domain';
export { createOrderUseCases } from './application/useCases';
export { createOrderRepoPg } from './persistence/OrderRepoPg';
export type {
  CustomerRecord,
  OrderActorType,
  OrderCheckoutMode,
  OrderDetailRecord,
  OrderItemRecord,
  OrderRecord,
  OrderStateHistoryRecord
} from './persistence/OrderRepoPg';
