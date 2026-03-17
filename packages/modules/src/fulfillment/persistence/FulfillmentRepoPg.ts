import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { BusinessHours } from '../domain';
import type { DeliveryZone, FulfillmentPolicy, FulfillmentSettings } from '../domain';

export type FulfillmentSettingsRecord = FulfillmentSettings;
export type DeliveryZoneRecord = DeliveryZone;

const mapSettings = (row: DatabaseSchema['fulfillment_settings']): FulfillmentSettingsRecord => ({
  tenantId: row.tenant_id,
  pickupEnabled: row.pickup_enabled,
  deliveryEnabled: row.delivery_enabled,
  pickupInstructions: row.pickup_instructions,
  deliveryInstructions: row.delivery_instructions,
  businessHours: row.business_hours as BusinessHours,
  cutoffRules: row.cutoff_rules,
  updatedAt: row.updated_at
});

const mapZone = (row: DatabaseSchema['delivery_zones']): DeliveryZoneRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  feeAmount: row.fee_amount,
  minOrderAmount: row.min_order_amount,
  isActive: row.is_active,
  sortOrder: row.sort_order,
  createdAt: row.created_at
});

const buildDefaultSettings = (tenantId: string): FulfillmentSettingsRecord => {
  const now = new Date();
  return {
    tenantId,
    pickupEnabled: true,
    deliveryEnabled: false,
    pickupInstructions: null,
    deliveryInstructions: null,
    businessHours: {},
    cutoffRules: {},
    updatedAt: now
  };
};

export const createFulfillmentRepoPg = (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>
) => ({
  async getSettings(tenantId: string): Promise<FulfillmentSettingsRecord> {
    const row = await db
      .selectFrom('fulfillment_settings')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    return row === undefined ? buildDefaultSettings(tenantId) : mapSettings(row);
  },

  async upsertSettings(input: {
    tenantId: string;
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    pickupInstructions: string | null;
    deliveryInstructions: string | null;
    businessHours: BusinessHours;
    cutoffRules: Record<string, unknown>;
  }): Promise<FulfillmentSettingsRecord> {
    const row = await db
      .insertInto('fulfillment_settings')
      .values({
        tenant_id: input.tenantId,
        pickup_enabled: input.pickupEnabled,
        delivery_enabled: input.deliveryEnabled,
        pickup_instructions: input.pickupInstructions,
        delivery_instructions: input.deliveryInstructions,
        business_hours: input.businessHours,
        cutoff_rules: input.cutoffRules,
        updated_at: sql`now()`
      })
      .onConflict((oc) =>
        oc.column('tenant_id').doUpdateSet({
          pickup_enabled: input.pickupEnabled,
          delivery_enabled: input.deliveryEnabled,
          pickup_instructions: input.pickupInstructions,
          delivery_instructions: input.deliveryInstructions,
          business_hours: input.businessHours,
          cutoff_rules: input.cutoffRules,
          updated_at: sql`now()`
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapSettings(row);
  },

  async listZones(tenantId: string, includeInactive = true): Promise<DeliveryZoneRecord[]> {
    let query = db
      .selectFrom('delivery_zones')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc');

    if (!includeInactive) {
      query = query.where('is_active', '=', true);
    }

    return (await query.execute()).map(mapZone);
  },

  async getZoneById(tenantId: string, zoneId: string): Promise<DeliveryZoneRecord | null> {
    const row = await db
      .selectFrom('delivery_zones')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', zoneId)
      .executeTakeFirst();

    return row === undefined ? null : mapZone(row);
  },

  async getZoneByName(tenantId: string, name: string): Promise<DeliveryZoneRecord | null> {
    const row = await db
      .selectFrom('delivery_zones')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('name', '=', name)
      .executeTakeFirst();

    return row === undefined ? null : mapZone(row);
  },

  async createZone(input: {
    tenantId: string;
    name: string;
    feeAmount: number;
    minOrderAmount: number | null;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<DeliveryZoneRecord> {
    const row = await db
      .insertInto('delivery_zones')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: input.tenantId,
        name: input.name,
        fee_amount: input.feeAmount,
        min_order_amount: input.minOrderAmount,
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? 0,
        created_at: sql`now()`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapZone(row);
  },

  async updateZone(input: {
    tenantId: string;
    zoneId: string;
    name?: string | undefined;
    feeAmount?: number | undefined;
    minOrderAmount?: number | null | undefined;
    isActive?: boolean | undefined;
    sortOrder?: number | undefined;
  }): Promise<DeliveryZoneRecord | null> {
    const row = await db
      .updateTable('delivery_zones')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.feeAmount !== undefined ? { fee_amount: input.feeAmount } : {}),
        ...(input.minOrderAmount !== undefined ? { min_order_amount: input.minOrderAmount } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {})
      })
      .where('tenant_id', '=', input.tenantId)
      .where('id', '=', input.zoneId)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapZone(row);
  },

  async countActiveZones(tenantId: string): Promise<number> {
    const row = await db
      .selectFrom('delivery_zones')
      .select(({ fn, ref }) => [fn.count<string>(ref('id')).as('count')])
      .where('tenant_id', '=', tenantId)
      .where('is_active', '=', true)
      .executeTakeFirstOrThrow();

    return Number(row.count);
  },

  async getPolicy(tenantId: string): Promise<FulfillmentPolicy> {
    const [settings, zones] = await Promise.all([
      this.getSettings(tenantId),
      this.listZones(tenantId)
    ]);
    return {
      settings,
      zones
    };
  }
});
