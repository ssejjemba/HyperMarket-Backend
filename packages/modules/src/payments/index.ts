import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';

export const registerPaymentRoutes = async (
  _server: FastifyInstance,
  _deps: ModuleDeps
): Promise<void> => {};

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
