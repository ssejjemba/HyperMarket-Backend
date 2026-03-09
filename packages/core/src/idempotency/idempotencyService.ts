import { sql, type Kysely, type Transaction } from 'kysely';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { DatabaseSchema } from '../db/client';
import type { IdempotencyBeginResult, IdempotencyRecord } from './types';

type IdempotencyRow = {
  id: string;
  tenant_id: string;
  operation: string;
  idempotency_key: string;
  request_hash: string;
  response_ref: string | null;
  created_at: Date;
  updated_at: Date;
};

const mapRow = (row: IdempotencyRow): IdempotencyRecord => {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    operation: row.operation,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    responseRef: row.response_ref ?? undefined,
    state: row.response_ref === null ? 'in_progress' : 'completed',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export type IdempotencyService = {
  begin: (
    trx: Transaction<DatabaseSchema>,
    tenantId: string,
    operation: string,
    key: string,
    requestHash: string
  ) => Promise<IdempotencyBeginResult>;
  complete: (
    trx: Transaction<DatabaseSchema>,
    id: string,
    responseRef: string
  ) => Promise<IdempotencyRecord>;
  resolveExisting: (
    db: Kysely<DatabaseSchema>,
    tenantId: string,
    operation: string,
    key: string
  ) => Promise<IdempotencyRecord | null>;
};

export const createIdempotencyService = (): IdempotencyService => {
  return {
    begin: async (trx, tenantId, operation, key, requestHash) => {
      const existing = await trx
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('operation', '=', operation)
        .where('idempotency_key', '=', key)
        .executeTakeFirst();

      if (existing !== undefined) {
        if (existing.request_hash !== requestHash) {
          throw new AppError({
            code: ErrorCode.IdempotencyConflict,
            message: 'Idempotency key reuse conflict',
            details: {
              operation,
              idempotency_key: key
            }
          });
        }

        return { status: 'replay', record: mapRow(existing as IdempotencyRow) };
      }

      const row = await trx
        .insertInto('idempotency_keys')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          tenant_id: tenantId,
          operation,
          idempotency_key: key,
          request_hash: requestHash,
          response_ref: null,
          created_at: sql`now()`,
          updated_at: sql`now()`
        })
        .returning([
          'id',
          'tenant_id',
          'operation',
          'idempotency_key',
          'request_hash',
          'response_ref',
          'created_at',
          'updated_at'
        ])
        .executeTakeFirstOrThrow();

      return { status: 'created', record: mapRow(row as IdempotencyRow) };
    },
    complete: async (trx, id, responseRef) => {
      const row = await trx
        .updateTable('idempotency_keys')
        .set({ response_ref: responseRef, updated_at: sql`now()` })
        .where('id', '=', id)
        .returning([
          'id',
          'tenant_id',
          'operation',
          'idempotency_key',
          'request_hash',
          'response_ref',
          'created_at',
          'updated_at'
        ])
        .executeTakeFirstOrThrow();

      return mapRow(row as IdempotencyRow);
    },
    resolveExisting: async (db, tenantId, operation, key) => {
      const row = await db
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('operation', '=', operation)
        .where('idempotency_key', '=', key)
        .executeTakeFirst();

      return row === undefined ? null : mapRow(row as IdempotencyRow);
    }
  };
};
