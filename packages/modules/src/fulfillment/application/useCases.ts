import {
  createAuditWriter,
  createOutboxWriter,
  runInTransaction,
  type DatabaseSchema
} from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';
import type { Kysely } from 'kysely';

import { createTenantRepoPg } from '../../tenancy/persistence/TenantRepoPg';
import {
  assertBusinessHours,
  assertDeliveryZoneInput,
  assertFulfillmentModes,
  isStoreOpen,
  type BusinessHours
} from '../domain';
import { FulfillmentError } from '../errors/FulfillmentError';
import { createFulfillmentRepoPg } from '../persistence/FulfillmentRepoPg';

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const toRequestId = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }

  return value;
};

const withOptionalRequestId = (value: string | undefined): { requestId?: string | undefined } =>
  value === undefined ? {} : { requestId: value };

const withOptionalCorrelationId = (value: string | null): { correlationId?: string | undefined } =>
  value === null ? {} : { correlationId: value };

const mapZoneConflict = (error: unknown): never => {
  if (
    error instanceof Error &&
    (error.message.includes('delivery_zones_tenant_name_unique') ||
      error.message.includes('duplicate key value'))
  ) {
    throw new FulfillmentError({
      code: ErrorCode.FulZoneNameTaken,
      message: 'Delivery zone name is already in use'
    });
  }

  throw error;
};

export const createFulfillmentUseCases = (deps: { db: Kysely<DatabaseSchema> }) => {
  const auditWriter = createAuditWriter();
  const outboxWriter = createOutboxWriter();
  const tenantRepo = createTenantRepoPg(deps.db);

  return {
    async getSettings(tenantId: string) {
      return createFulfillmentRepoPg(deps.db).getSettings(tenantId);
    },

    async updateSettings(input: {
      tenantId: string;
      actorUserId: string;
      requestId?: string | undefined;
      pickupEnabled?: boolean | undefined;
      deliveryEnabled?: boolean | undefined;
      pickupInstructions?: string | null | undefined;
      deliveryInstructions?: string | null | undefined;
      businessHours?: BusinessHours | undefined;
    }) {
      return runInTransaction(deps.db, async (trx) => {
        const repo = createFulfillmentRepoPg(trx);
        const current = await repo.getSettings(input.tenantId);
        const next = {
          pickupEnabled: input.pickupEnabled ?? current.pickupEnabled,
          deliveryEnabled: input.deliveryEnabled ?? current.deliveryEnabled,
          pickupInstructions:
            input.pickupInstructions !== undefined
              ? normalizeOptionalText(input.pickupInstructions)
              : current.pickupInstructions,
          deliveryInstructions:
            input.deliveryInstructions !== undefined
              ? normalizeOptionalText(input.deliveryInstructions)
              : current.deliveryInstructions,
          businessHours:
            input.businessHours !== undefined
              ? assertBusinessHours(input.businessHours)
              : current.businessHours,
          cutoffRules: current.cutoffRules
        };

        assertFulfillmentModes(next);
        if (next.deliveryEnabled && (await repo.countActiveZones(input.tenantId)) === 0) {
          throw new FulfillmentError({
            code: ErrorCode.FulDeliveryEnabledWithoutZones,
            message: 'Delivery cannot be enabled without at least one active delivery zone'
          });
        }

        const updated = await repo.upsertSettings({
          tenantId: input.tenantId,
          ...next
        });

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'fulfillment.settings.updated',
          targetType: 'fulfillment_settings',
          targetId: input.tenantId,
          before: {
            pickup_enabled: current.pickupEnabled,
            delivery_enabled: current.deliveryEnabled,
            pickup_instructions: current.pickupInstructions,
            delivery_instructions: current.deliveryInstructions,
            business_hours: current.businessHours
          },
          after: {
            pickup_enabled: updated.pickupEnabled,
            delivery_enabled: updated.deliveryEnabled,
            pickup_instructions: updated.pickupInstructions,
            delivery_instructions: updated.deliveryInstructions,
            business_hours: updated.businessHours
          },
          ...withOptionalRequestId(input.requestId)
        });

        await outboxWriter.write(trx, {
          eventType: 'Fulfillment.SettingsUpdated',
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          ...withOptionalCorrelationId(toRequestId(input.requestId)),
          payload: {
            tenant_id: input.tenantId
          }
        });

        return updated;
      });
    },

    async listZones(tenantId: string, includeInactive = true) {
      return createFulfillmentRepoPg(deps.db).listZones(tenantId, includeInactive);
    },

    async createZone(input: {
      tenantId: string;
      actorUserId: string;
      requestId?: string | undefined;
      name: string;
      feeAmount: number;
      minOrderAmount?: number | null | undefined;
      sortOrder?: number | undefined;
      isActive?: boolean | undefined;
    }) {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createFulfillmentRepoPg(trx);
          const zoneInput = assertDeliveryZoneInput({
            name: input.name,
            feeAmount: input.feeAmount,
            minOrderAmount: input.minOrderAmount
          });
          const zone = await repo.createZone({
            tenantId: input.tenantId,
            name: zoneInput.name,
            feeAmount: zoneInput.feeAmount,
            minOrderAmount: zoneInput.minOrderAmount,
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
          });

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'fulfillment.zone.created',
            targetType: 'delivery_zone',
            targetId: zone.id,
            after: {
              name: zone.name,
              fee_amount: zone.feeAmount,
              min_order_amount: zone.minOrderAmount,
              is_active: zone.isActive,
              sort_order: zone.sortOrder
            },
            ...withOptionalRequestId(input.requestId)
          });

          await outboxWriter.write(trx, {
            eventType: 'Fulfillment.ZoneUpserted',
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            ...withOptionalCorrelationId(toRequestId(input.requestId)),
            payload: {
              tenant_id: input.tenantId,
              zone_id: zone.id
            }
          });

          return zone;
        });
      } catch (error) {
        return mapZoneConflict(error);
      }
    },

    async updateZone(input: {
      tenantId: string;
      zoneId: string;
      actorUserId: string;
      requestId?: string | undefined;
      name?: string | undefined;
      feeAmount?: number | undefined;
      minOrderAmount?: number | null | undefined;
      sortOrder?: number | undefined;
      isActive?: boolean | undefined;
    }) {
      try {
        return await runInTransaction(deps.db, async (trx) => {
          const repo = createFulfillmentRepoPg(trx);
          const current = await repo.getZoneById(input.tenantId, input.zoneId);
          if (current === null) {
            throw new FulfillmentError({
              code: ErrorCode.FulZoneNotFound,
              message: 'Delivery zone not found'
            });
          }

          const validated =
            input.name !== undefined ||
            input.feeAmount !== undefined ||
            input.minOrderAmount !== undefined
              ? assertDeliveryZoneInput({
                  name: input.name ?? current.name,
                  feeAmount: input.feeAmount ?? current.feeAmount,
                  minOrderAmount:
                    input.minOrderAmount !== undefined
                      ? input.minOrderAmount
                      : current.minOrderAmount
                })
              : {
                  name: current.name,
                  feeAmount: current.feeAmount,
                  minOrderAmount: current.minOrderAmount
                };

          const nextActive = input.isActive ?? current.isActive;
          if (!nextActive) {
            const settings = await repo.getSettings(input.tenantId);
            if (settings.deliveryEnabled && (await repo.countActiveZones(input.tenantId)) <= 1) {
              throw new FulfillmentError({
                code: ErrorCode.FulDeliveryEnabledWithoutZones,
                message: 'Delivery cannot remain enabled without an active delivery zone'
              });
            }
          }

          const updated = await repo.updateZone({
            tenantId: input.tenantId,
            zoneId: input.zoneId,
            name: validated.name,
            feeAmount: validated.feeAmount,
            minOrderAmount: validated.minOrderAmount,
            sortOrder: input.sortOrder,
            isActive: input.isActive
          });

          if (updated === null) {
            throw new FulfillmentError({
              code: ErrorCode.FulZoneNotFound,
              message: 'Delivery zone not found'
            });
          }

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: 'fulfillment.zone.updated',
            targetType: 'delivery_zone',
            targetId: updated.id,
            before: {
              name: current.name,
              fee_amount: current.feeAmount,
              min_order_amount: current.minOrderAmount,
              is_active: current.isActive,
              sort_order: current.sortOrder
            },
            after: {
              name: updated.name,
              fee_amount: updated.feeAmount,
              min_order_amount: updated.minOrderAmount,
              is_active: updated.isActive,
              sort_order: updated.sortOrder
            },
            ...withOptionalRequestId(input.requestId)
          });

          await outboxWriter.write(trx, {
            eventType: updated.isActive
              ? 'Fulfillment.ZoneUpserted'
              : 'Fulfillment.ZoneDeactivated',
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            ...withOptionalCorrelationId(toRequestId(input.requestId)),
            payload: {
              tenant_id: input.tenantId,
              zone_id: updated.id
            }
          });

          return updated;
        });
      } catch (error) {
        return mapZoneConflict(error);
      }
    },

    async deactivateZone(input: {
      tenantId: string;
      zoneId: string;
      actorUserId: string;
      requestId?: string | undefined;
    }) {
      return this.updateZone({
        tenantId: input.tenantId,
        zoneId: input.zoneId,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        isActive: false
      });
    },

    async getStorefrontOptions(tenantId: string, now = new Date()) {
      const [policy, tenant] = await Promise.all([
        createFulfillmentRepoPg(deps.db).getPolicy(tenantId),
        tenantRepo.findById(tenantId)
      ]);
      const openStatus = isStoreOpen(policy.settings.businessHours, now);

      return {
        pickupEnabled: policy.settings.pickupEnabled,
        deliveryEnabled: policy.settings.deliveryEnabled,
        pickupInstructions: policy.settings.pickupInstructions,
        deliveryInstructions: policy.settings.deliveryInstructions,
        zones: policy.zones.filter((zone) => zone.isActive),
        currency: tenant?.defaultCurrency ?? 'UGX',
        open: openStatus.open,
        openReason: openStatus.open ? null : openStatus.reason
      };
    }
  };
};

export const createFulfillmentPolicyReaderPg = (db: Kysely<DatabaseSchema>) => ({
  async getPolicy(tenantId: string) {
    return createFulfillmentRepoPg(db).getPolicy(tenantId);
  }
});
