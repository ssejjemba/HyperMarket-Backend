import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { createRedisStorefrontRateLimiter } from '../rateLimit/RedisStorefrontRateLimiter';
import { createTenantRepoPg } from '../tenancy/persistence/TenantRepoPg';
import { createOrderPaymentPort } from '../orders';
import { registerPaymentApiRoutes } from './api/routes';
import { createPaymentUseCases } from './application/useCases';

export const registerPaymentRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  const tenantRepo = createTenantRepoPg(deps.db);
  const storefrontRateLimiter = createRedisStorefrontRateLimiter({
    redisUrl: deps.config.redisUrl,
    keyPrefix: 'storefront:payments:rate-limit',
    max: deps.config.publicPaymentRateLimitMax ?? 10,
    windowSeconds: deps.config.publicPaymentRateLimitWindowSeconds ?? 60
  });
  server.addHook('onClose', async () => {
    await storefrontRateLimiter.close();
  });
  const orderPaymentPort = createOrderPaymentPort({
    db: deps.db
  });
  const useCases = createPaymentUseCases({
    db: deps.db,
    config: deps.config,
    orderPaymentPort
  });

  await registerPaymentApiRoutes(server, {
    logger: deps.logger,
    tenantRepo,
    useCases,
    storefrontRateLimiter
  });
};

export { PaymentError } from './errors/PaymentError';
export type { PaymentErrorCode } from './errors/PaymentError';
export { registerPaymentApiRoutes } from './api/routes';
export { createPaymentProviderRegistry } from './application/providerRegistry';
export { createPaymentUseCases } from './application/useCases';
export {
  assertPaymentIntentTransition,
  createFlutterwaveTxRef,
  createPaymentRequestHash,
  CustomerEmail,
  CustomerPhone,
  FLUTTERWAVE_NETWORKS,
  FlutterwaveNetwork,
  PAYMENT_INTENT_STATUSES
} from './domain';
export type { PaymentIntentStatus } from './domain';
export { createFlutterwaveProvider, createMockMomoProvider, signMockMomoWebhook } from './provider';
export type { FlutterwaveHttpClient } from './provider';
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
