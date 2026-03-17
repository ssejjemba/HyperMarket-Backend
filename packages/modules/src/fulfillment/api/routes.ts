import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { requireTenantMembership, requireTenantOwner } from '@hypermarket/core/http';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type { MembershipReader } from '../../tenancy/MembershipReader';
import type { TenantRepository } from '../../tenancy/persistence/TenantRepository';
import type { createFulfillmentUseCases } from '../application/useCases';
import type { BusinessHours } from '../domain';
import {
  createZoneBodySchema,
  listZonesQuerySchema,
  parseFulfillmentValidation,
  storefrontTenantParamsSchema,
  tenantIdParamsSchema,
  updateSettingsBodySchema,
  updateZoneBodySchema,
  zoneParamsSchema
} from './schemas/fulfillmentSchemas';

export type FulfillmentApiDeps = {
  logger: BaseLogger;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  tenantRepo: TenantRepository;
  useCases: ReturnType<typeof createFulfillmentUseCases>;
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

export const registerFulfillmentApiRoutes = async (
  server: FastifyInstance,
  deps: FulfillmentApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'fulfillment' }, 'registering FUL routes');

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

  server.get(
    '/tenants/:tenantId/fulfillment/settings',
    { preHandler: tenantGuard },
    async (request) => {
      parseFulfillmentValidation(tenantIdParamsSchema.safeParse(request.params));
      const settings = await deps.useCases.getSettings(getTenantId(request));
      return {
        settings: {
          pickup_enabled: settings.pickupEnabled,
          delivery_enabled: settings.deliveryEnabled,
          pickup_instructions: settings.pickupInstructions,
          delivery_instructions: settings.deliveryInstructions,
          business_hours: settings.businessHours,
          updated_at: settings.updatedAt.toISOString()
        }
      };
    }
  );

  server.patch(
    '/tenants/:tenantId/fulfillment/settings',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      parseFulfillmentValidation(tenantIdParamsSchema.safeParse(request.params));
      const body = parseFulfillmentValidation(updateSettingsBodySchema.safeParse(request.body));
      const settings = await deps.useCases.updateSettings({
        tenantId: getTenantId(request),
        actorUserId: getActorUserId(request),
        requestId: request.id,
        ...(body.pickup_enabled !== undefined ? { pickupEnabled: body.pickup_enabled } : {}),
        ...(body.delivery_enabled !== undefined ? { deliveryEnabled: body.delivery_enabled } : {}),
        ...(body.pickup_instructions !== undefined
          ? { pickupInstructions: body.pickup_instructions }
          : {}),
        ...(body.delivery_instructions !== undefined
          ? { deliveryInstructions: body.delivery_instructions }
          : {}),
        ...(body.business_hours !== undefined
          ? { businessHours: body.business_hours as BusinessHours }
          : {})
      });

      return {
        settings: {
          pickup_enabled: settings.pickupEnabled,
          delivery_enabled: settings.deliveryEnabled,
          pickup_instructions: settings.pickupInstructions,
          delivery_instructions: settings.deliveryInstructions,
          business_hours: settings.businessHours,
          updated_at: settings.updatedAt.toISOString()
        }
      };
    }
  );

  server.get(
    '/tenants/:tenantId/fulfillment/zones',
    { preHandler: tenantGuard },
    async (request) => {
      parseFulfillmentValidation(tenantIdParamsSchema.safeParse(request.params));
      const query = parseFulfillmentValidation(listZonesQuerySchema.safeParse(request.query));
      const zones = await deps.useCases.listZones(
        getTenantId(request),
        query.include_inactive ?? true
      );

      return {
        zones: zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          fee_amount: zone.feeAmount,
          min_order_amount: zone.minOrderAmount,
          is_active: zone.isActive,
          sort_order: zone.sortOrder,
          created_at: zone.createdAt.toISOString()
        }))
      };
    }
  );

  server.post(
    '/tenants/:tenantId/fulfillment/zones',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      parseFulfillmentValidation(tenantIdParamsSchema.safeParse(request.params));
      const body = parseFulfillmentValidation(createZoneBodySchema.safeParse(request.body));
      const zone = await deps.useCases.createZone({
        tenantId: getTenantId(request),
        actorUserId: getActorUserId(request),
        requestId: request.id,
        name: body.name,
        feeAmount: body.fee_amount,
        ...(body.min_order_amount !== undefined ? { minOrderAmount: body.min_order_amount } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {})
      });

      return {
        zone: {
          id: zone.id,
          name: zone.name,
          fee_amount: zone.feeAmount,
          min_order_amount: zone.minOrderAmount,
          is_active: zone.isActive,
          sort_order: zone.sortOrder,
          created_at: zone.createdAt.toISOString()
        }
      };
    }
  );

  server.patch(
    '/tenants/:tenantId/fulfillment/zones/:zoneId',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseFulfillmentValidation(zoneParamsSchema.safeParse(request.params));
      const body = parseFulfillmentValidation(updateZoneBodySchema.safeParse(request.body));
      const zone = await deps.useCases.updateZone({
        tenantId: getTenantId(request),
        zoneId: params.zoneId,
        actorUserId: getActorUserId(request),
        requestId: request.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.fee_amount !== undefined ? { feeAmount: body.fee_amount } : {}),
        ...(body.min_order_amount !== undefined ? { minOrderAmount: body.min_order_amount } : {}),
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {})
      });

      return {
        zone: {
          id: zone.id,
          name: zone.name,
          fee_amount: zone.feeAmount,
          min_order_amount: zone.minOrderAmount,
          is_active: zone.isActive,
          sort_order: zone.sortOrder,
          created_at: zone.createdAt.toISOString()
        }
      };
    }
  );

  server.delete(
    '/tenants/:tenantId/fulfillment/zones/:zoneId',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseFulfillmentValidation(zoneParamsSchema.safeParse(request.params));
      const zone = await deps.useCases.deactivateZone({
        tenantId: getTenantId(request),
        zoneId: params.zoneId,
        actorUserId: getActorUserId(request),
        requestId: request.id
      });

      return {
        zone: {
          id: zone.id,
          name: zone.name,
          fee_amount: zone.feeAmount,
          min_order_amount: zone.minOrderAmount,
          is_active: zone.isActive,
          sort_order: zone.sortOrder,
          created_at: zone.createdAt.toISOString()
        }
      };
    }
  );

  server.get('/storefront/:tenantSlug/fulfillment/options', async (request) => {
    const params = parseFulfillmentValidation(
      storefrontTenantParamsSchema.safeParse(request.params)
    );
    const tenantId = await resolveTenantIdBySlug(deps.tenantRepo, params.tenantSlug);
    const options = await deps.useCases.getStorefrontOptions(tenantId);

    return {
      fulfillment: {
        pickup_enabled: options.pickupEnabled,
        delivery_enabled: options.deliveryEnabled,
        pickup_instructions: options.pickupInstructions,
        delivery_instructions: options.deliveryInstructions,
        currency: options.currency,
        store_open: options.open,
        store_closed_reason: options.openReason,
        delivery_zones: options.zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          fee_amount: zone.feeAmount,
          min_order_amount: zone.minOrderAmount,
          sort_order: zone.sortOrder
        }))
      }
    };
  });
};
