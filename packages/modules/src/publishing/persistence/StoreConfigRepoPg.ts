import { sql, type Kysely, type Transaction } from 'kysely';

import { ErrorCode } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';

import type { ValidationReport } from '../domain';
import { PublishingError } from '../errors/PublishingError';
import type { StoreConfig, StoreConfigRepository } from './StoreConfigRepository';

type Db = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;
type StoreConfigRow = DatabaseSchema['store_configs'];

const mapStoreConfig = (row: StoreConfigRow): StoreConfig => ({
  id: row.id,
  tenantId: row.tenant_id,
  status: row.status,
  templateId: row.template_id,
  templateVersion: row.template_version,
  configVersion: row.config_version,
  configPayload: row.config_payload,
  validationReport: (row.validation_report as ValidationReport | null) ?? null,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at
});

export const createStoreConfigRepoPg = (db: Db): StoreConfigRepository => ({
  createDraftConfig: async (input) =>
    withStoreConfigTx(db, async (trx) => {
      await trx
        .selectFrom('tenants')
        .select('id')
        .where('id', '=', input.tenantId)
        .forUpdate()
        .executeTakeFirst();

      const versionRow = await trx
        .selectFrom('store_configs')
        .select((eb) =>
          sql<number>`coalesce(max(${eb.ref('config_version')}), 0)`.as('current_config_version')
        )
        .where('tenant_id', '=', input.tenantId)
        .executeTakeFirstOrThrow();

      const row = await trx
        .insertInto('store_configs')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          tenant_id: input.tenantId,
          status: 'draft',
          template_id: input.templateId,
          template_version: input.templateVersion,
          config_version: versionRow.current_config_version + 1,
          config_payload: input.configPayload,
          validation_report: input.validationReport ?? null,
          created_by_user_id: input.createdByUserId,
          created_at: sql`now()`
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapStoreConfig(row);
    }),
  getConfigById: async (tenantId, configId) => {
    const row = await db
      .selectFrom('store_configs')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', configId)
      .executeTakeFirst();

    return row === undefined ? null : mapStoreConfig(row);
  },
  listConfigs: async (tenantId) => {
    const rows = await db
      .selectFrom('store_configs')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('config_version', 'desc')
      .execute();

    return rows.map((row) => mapStoreConfig(row));
  },
  updateDraftConfig: async (input) =>
    withStoreConfigTx(db, async (trx) => {
      const existing = await trx
        .selectFrom('store_configs')
        .selectAll()
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.configId)
        .executeTakeFirst();

      if (existing === undefined) {
        throw new PublishingError({
          code: ErrorCode.ConfigNotFound,
          message: 'Config not found',
          details: {
            tenant_id: input.tenantId,
            config_id: input.configId
          }
        });
      }

      if (existing.status !== 'draft') {
        throw new PublishingError({
          code: ErrorCode.ConfigNotDraft,
          message: 'Only draft configs can be updated',
          details: {
            tenant_id: input.tenantId,
            config_id: input.configId
          }
        });
      }

      const row = await trx
        .updateTable('store_configs')
        .set({
          config_payload: input.configPayload,
          validation_report: input.validationReport ?? null
        })
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.configId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapStoreConfig(row);
    }),
  getActiveConfig: async (tenantId) => {
    const row = await db
      .selectFrom('tenants')
      .innerJoin('store_configs', 'store_configs.id', 'tenants.active_config_id')
      .selectAll('store_configs')
      .where('tenants.id', '=', tenantId)
      .executeTakeFirst();

    return row === undefined ? null : mapStoreConfig(row);
  }
});

const withStoreConfigTx = async <T>(
  db: Db,
  fn: (trx: Transaction<DatabaseSchema>) => Promise<T>
): Promise<T> => {
  if (db.isTransaction) {
    return fn(db as Transaction<DatabaseSchema>);
  }

  return db.transaction().execute(async (trx) => fn(trx));
};
