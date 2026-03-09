import { sql, type Transaction } from 'kysely';

import type { DatabaseSchema } from '../db/client';
import type { OutboxEvent, OutboxRecord } from './types';

type OutboxRow = {
  id: string;
  event_type: string;
  tenant_id: string | null;
  correlation_id: string | null;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: Date;
  available_at: Date;
  dispatched_at: Date | null;
  attempts: number;
  last_error: string | null;
};

const mapRow = (row: OutboxRow): OutboxRecord => {
  return {
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
  };
};

export type OutboxWriter = {
  write: (trx: Transaction<DatabaseSchema>, event: OutboxEvent) => Promise<OutboxRecord>;
};

export const createOutboxWriter = (): OutboxWriter => {
  return {
    write: async (trx, event) => {
      const row = await trx
        .insertInto('outbox_events')
        .values({
          id: event.id ?? (sql`gen_random_uuid()` as unknown as string),
          event_type: event.eventType,
          tenant_id: event.tenantId ?? null,
          correlation_id: event.correlationId ?? null,
          actor_user_id: event.actorUserId ?? null,
          payload: event.payload,
          occurred_at: event.occurredAt ?? sql`now()`,
          available_at: event.availableAt ?? sql`now()`,
          attempts: 0,
          last_error: null,
          dispatched_at: null,
          created_at: sql`now()`
        })
        .returning([
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
        .executeTakeFirstOrThrow();

      return mapRow(row as OutboxRow);
    }
  };
};
