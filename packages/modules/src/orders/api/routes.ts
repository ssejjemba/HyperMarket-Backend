import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { requireTenantMembership, requireTenantOwner } from '@hypermarket/core/http';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type { MembershipReader } from '../../tenancy/MembershipReader';
import type { TenantRepository } from '../../tenancy/persistence/TenantRepository';
import type { StorefrontRateLimiter } from '../../rateLimit/RedisStorefrontRateLimiter';
import type { createOrderUseCases } from '../application/useCases';
import { mapOrderDetailDto, mapOrderSummaryDto, mapPublicOrderDto } from './controllers/mappers';
import {
  createOrderBodySchema,
  listOrdersQuerySchema,
  orderParamsSchema,
  parseOrderValidation,
  storefrontTenantParamsSchema,
  tenantIdParamsSchema,
  transitionOrderBodySchema
} from './schemas/orderSchemas';

export type OrdersApiDeps = {
  logger: BaseLogger;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  tenantRepo: TenantRepository;
  useCases: ReturnType<typeof createOrderUseCases>;
  storefrontRateLimiter?: StorefrontRateLimiter | undefined;
};

const normalizeCustomerInput = (
  input: ReturnType<typeof createOrderBodySchema.parse>['customer']
): {
  full_name?: string | null;
  phone_e164?: string | null;
  email?: string | null;
  contact_preference?: string | null;
} => ({
  ...(input.full_name !== undefined ? { full_name: input.full_name } : {}),
  ...(input.phone_e164 !== undefined ? { phone_e164: input.phone_e164 } : {}),
  ...(input.email !== undefined ? { email: input.email } : {}),
  ...(input.contact_preference !== undefined
    ? { contact_preference: input.contact_preference }
    : {})
});

const normalizeFulfillmentInput = (
  input: ReturnType<typeof createOrderBodySchema.parse>['fulfillment']
) => {
  if (input.type === 'pickup') {
    return {
      type: 'pickup' as const,
      pickup_location_label: input.pickup_location_label,
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {})
    };
  }

  return {
    type: 'delivery' as const,
    address_label: input.address_label,
    recipient_name: input.recipient_name,
    recipient_phone: input.recipient_phone,
    ...(input.zone_id !== undefined ? { zone_id: input.zone_id } : {}),
    ...(input.zone_name !== undefined ? { zone_name: input.zone_name } : {}),
    ...(input.location_hint !== undefined ? { location_hint: input.location_hint } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {})
  };
};

const resolveTenantIdBySlug = async (
  tenantRepo: TenantRepository,
  tenantSlug: string
): Promise<string> => {
  const tenant = await tenantRepo.findBySlug(tenantSlug);
  if (tenant === null) {
    throw new AppError({
      code: ErrorCode.TenantResolutionFailed,
      message: 'Tenant not found'
    });
  }

  return tenant.id;
};

const getTenantId = (request: FastifyRequest): string => {
  const tenantId = request.tenant?.tenantId;
  if (tenantId === undefined) {
    throw new Error('tenant context is required');
  }

  return tenantId;
};

const getActorUserId = (request: FastifyRequest): string => {
  const userId = request.auth?.userId;
  if (userId === undefined) {
    throw new Error('auth context is required');
  }

  return userId;
};

const getIdempotencyKey = (request: FastifyRequest): string => {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;

  if (value === undefined || value.trim().length === 0) {
    throw new AppError({
      code: ErrorCode.OrderValidationFailed,
      message: 'Idempotency-Key header is required'
    });
  }

  return value.trim();
};

export const registerOrderApiRoutes = async (
  server: FastifyInstance,
  deps: OrdersApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'orders' }, 'registering ORD routes');

  const tenantGuard = requireTenantMembership({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });
  const tenantOwnerGuard = requireTenantOwner({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });

  server.post('/storefront/:tenantSlug/orders', async (request, reply) => {
    const params = parseOrderValidation(storefrontTenantParamsSchema.safeParse(request.params));
    const body = parseOrderValidation(createOrderBodySchema.safeParse(request.body));
    const tenantId = await resolveTenantIdBySlug(deps.tenantRepo, params.tenantSlug);

    if (deps.storefrontRateLimiter !== undefined) {
      const decision = await deps.storefrontRateLimiter.check(`${tenantId}:${request.ip}`);
      if (!decision.allowed) {
        reply.header('Retry-After', String(decision.retryAfterSeconds));
        throw new AppError({
          code: ErrorCode.RateLimited,
          message: 'Too many checkout requests',
          details: {
            retry_after_seconds: decision.retryAfterSeconds
          }
        });
      }
    }

    const created = await deps.useCases.createOrder({
      tenantId,
      idempotencyKey: getIdempotencyKey(request),
      requestId: request.id,
      checkoutMode: body.checkout_mode,
      items: body.items.map((item) => ({
        ...(item.product_id !== undefined ? { productId: item.product_id } : {}),
        ...(item.product_slug !== undefined ? { productSlug: item.product_slug } : {}),
        ...(item.variant_id !== undefined ? { variantId: item.variant_id } : {}),
        quantity: item.quantity
      })),
      customer: normalizeCustomerInput(body.customer),
      fulfillment: normalizeFulfillmentInput(body.fulfillment),
      ...(body.notes !== undefined ? { notes: body.notes } : {})
    });

    return mapPublicOrderDto(created.order);
  });

  server.get('/tenants/:tenantId/orders', { preHandler: tenantGuard }, async (request) => {
    parseOrderValidation(tenantIdParamsSchema.safeParse(request.params));
    const query = parseOrderValidation(listOrdersQuerySchema.safeParse(request.query));
    const result = await deps.useCases.listOrders({
      tenantId: getTenantId(request),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {})
    });

    return {
      orders: result.items.map(mapOrderSummaryDto),
      next_cursor: result.nextCursor
    };
  });

  server.get('/tenants/:tenantId/orders/:orderId', { preHandler: tenantGuard }, async (request) => {
    const params = parseOrderValidation(orderParamsSchema.safeParse(request.params));
    const order = await deps.useCases.getOrder(getTenantId(request), params.orderId);
    return mapOrderDetailDto(order);
  });

  server.post(
    '/tenants/:tenantId/orders/:orderId/transition',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseOrderValidation(orderParamsSchema.safeParse(request.params));
      const body = parseOrderValidation(transitionOrderBodySchema.safeParse(request.body));
      const order = await deps.useCases.transitionOrder({
        tenantId: getTenantId(request),
        orderId: params.orderId,
        actorUserId: getActorUserId(request),
        requestId: request.id,
        action: body.action,
        ...(body.reason !== undefined ? { reason: body.reason } : {})
      });

      return mapOrderDetailDto(order);
    }
  );
};
