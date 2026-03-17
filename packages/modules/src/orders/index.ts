import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import { createMembershipReaderPg } from '../tenancy/persistence/TenancyMembershipReaderPg';
import { createTenantRepoPg } from '../tenancy/persistence/TenantRepoPg';
import { createRedisStorefrontRateLimiter } from '../rateLimit/RedisStorefrontRateLimiter';
import { registerOrderApiRoutes } from './api/routes';
import { createOrderUseCases } from './application/useCases';

export const registerOrderRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  const sessionRepo = createSessionRepoPg(deps.db);
  const tokenSigner = createTokenSigner({
    secret: deps.config.jwtSecret,
    ttlSeconds: deps.config.sessionTtlSeconds,
    issuer: deps.config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: deps.config.sessionTtlSeconds
  });
  const membershipReader = createMembershipReaderPg(deps.db);
  const tenantRepo = createTenantRepoPg(deps.db);
  const storefrontRateLimiter = createRedisStorefrontRateLimiter({
    redisUrl: deps.config.redisUrl,
    keyPrefix: 'storefront:orders:rate-limit',
    max: deps.config.publicOrderRateLimitMax ?? 20,
    windowSeconds: deps.config.publicOrderRateLimitWindowSeconds ?? 60
  });
  server.addHook('onClose', async () => {
    await storefrontRateLimiter.close();
  });
  const useCases = createOrderUseCases({
    db: deps.db
  });

  await registerOrderApiRoutes(server, {
    logger: deps.logger,
    sessionService,
    membershipReader,
    tenantRepo,
    useCases,
    storefrontRateLimiter
  });
};

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
export { registerOrderApiRoutes } from './api/routes';
export { createOrderPaymentPort } from './application/paymentPort';
export type { OrderPaymentPort } from './application/paymentPort';
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
