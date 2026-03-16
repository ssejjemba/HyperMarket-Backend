import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';

export const registerPaymentRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {};

export { PaymentError } from './errors/PaymentError';
export type { PaymentErrorCode } from './errors/PaymentError';
export { createPaymentProviderRegistry } from './application/providerRegistry';
export { createPaymentUseCases } from './application/useCases';
export {
  assertPaymentIntentTransition,
  createPaymentRequestHash,
  CustomerPhone,
  PAYMENT_INTENT_STATUSES
} from './domain';
export type { PaymentIntentStatus } from './domain';
export { createMockMomoProvider, signMockMomoWebhook } from './provider';
export { createPaymentRepoPg } from './persistence/PaymentRepoPg';
export type { PaymentIntentRecord, PaymentProviderEventRecord } from './persistence/PaymentRepoPg';
export type {
  PaymentIntentProviderStatus,
  PaymentMethod,
  PaymentProvider,
  ProviderCreateIntentInput,
  ProviderCreateIntentResult,
  ProviderStatusResult,
  ProviderWebhookEvent,
  ProviderWebhookHttpRequest
} from './provider';
