import type { Kysely } from 'kysely';

import type { DatabaseSchema } from '../db/client';
import type { OutboxRecord } from './types';

type OutboxDispatcherOptions = {
  batchSize?: number;
};

export type OutboxDispatcher = {
  fetchPending: (db: Kysely<DatabaseSchema>) => Promise<OutboxRecord[]>;
  markDispatched: (db: Kysely<DatabaseSchema>, ids: string[]) => Promise<void>;
  markFailed: (db: Kysely<DatabaseSchema>, id: string, reason: string) => Promise<void>;
};

export const createOutboxDispatcher = (options: OutboxDispatcherOptions = {}): OutboxDispatcher => {
  const batchSize = options.batchSize ?? 100;

  return {
    fetchPending: async (db) => {
      const rows = await db
        .selectFrom('outbox_events')
        .select([
          'id',
          'event_type',
          'tenant_id',
          'correlation_id',
          'actor_user_id',
          'payload',
          'occurred_at',
          'available_at',
          'dispatched_at',
          'attempts',
          'last_error'
        ])
        .where('dispatched_at', 'is', null)
        .where('available_at', '<=', new Date())
        .orderBy('occurred_at', 'asc')
        .limit(batchSize)
        .execute();

      return rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        tenantId: row.tenant_id ?? undefined,
        correlationId: row.correlation_id ?? undefined,
        actorUserId: row.actor_user_id ?? undefined,
        payload: row.payload,
        occurredAt: row.occurred_at,
        availableAt: row.available_at,
        dispatchedAt: row.dispatched_at ?? undefined,
        attempts: row.attempts,
        lastError: row.last_error ?? undefined
      }));
    },
    markDispatched: async (db, ids) => {
      if (ids.length === 0) {
        return;
      }

      await db
        .updateTable('outbox_events')
        .set({ dispatched_at: new Date() })
        .where('id', 'in', ids)
        .execute();
    },
    markFailed: async (db, id, reason) => {
      const row = await db
        .selectFrom('outbox_events')
        .select(['attempts'])
        .where('id', '=', id)
        .executeTakeFirst();

      const attempts = row?.attempts ?? 0;

      await db
        .updateTable('outbox_events')
        .set({ attempts: attempts + 1, last_error: reason })
        .where('id', '=', id)
        .execute();
    }
  };
};
