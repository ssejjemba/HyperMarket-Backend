import { sql, type Transaction } from 'kysely';

import type { DatabaseSchema } from '../db/client';
import type { AuditEvent, AuditRecord } from './types';

type AuditRow = {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request_id: string | null;
  occurred_at: Date;
  created_at: Date;
};

const mapRow = (row: AuditRow): AuditRecord => {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id ?? undefined,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    before: row.before ?? undefined,
    after: row.after ?? undefined,
    requestId: row.request_id ?? undefined,
    occurredAt: row.occurred_at,
    createdAt: row.created_at
  };
};

export type AuditWriter = {
  write: (trx: Transaction<DatabaseSchema>, event: AuditEvent) => Promise<AuditRecord>;
};

export const createAuditWriter = (): AuditWriter => {
  return {
    write: async (trx, event) => {
      const row = await trx
        .insertInto('audit_events')
        .values({
          id: event.id ?? (sql`gen_random_uuid()` as unknown as string),
          tenant_id: event.tenantId,
          actor_user_id: event.actorUserId ?? null,
          action: event.action,
          target_type: event.targetType,
          target_id: event.targetId,
          before: event.before ?? null,
          after: event.after ?? null,
          request_id: event.requestId ?? null,
          occurred_at: event.occurredAt ?? sql`now()`,
          created_at: sql`now()`
        })
        .returning([
          'id',
          'tenant_id',
          'actor_user_id',
          'action',
          'target_type',
          'target_id',
          'before',
          'after',
          'request_id',
          'occurred_at',
          'created_at'
        ])
        .executeTakeFirstOrThrow();

      return mapRow(row as AuditRow);
    }
  };
};
