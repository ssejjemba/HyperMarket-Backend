import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';

export const registerFulfillmentRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {};

export {
  assertBusinessHours,
  assertDeliveryZoneInput,
  assertFulfillmentModes,
  BUSINESS_DAY_KEYS,
  calculateDeliveryFee,
  isStoreOpen,
  validateFulfillmentSelection
} from './domain';
export type {
  BusinessDayKey,
  BusinessHours,
  BusinessHoursDay,
  BusinessOpenReason,
  DeliveryZone,
  FulfillmentPolicy,
  FulfillmentSelection,
  FulfillmentSettings
} from './domain';
export { FulfillmentError } from './errors/FulfillmentError';
export type { FulfillmentErrorCode } from './errors/FulfillmentError';
