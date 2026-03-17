import type { Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { NotificationJobStatus } from '../../notifications/domain';
import type { PaymentIntentStatus } from '../../payments/domain';

export type OpsOutboxStatus = 'pending' | 'failed' | 'dispatched';

export const createOpsRepoPg = (db: Kysely<DatabaseSchema>) => ({
  async getSummary(tenantId: string): Promise<{
    outbox: {
      pending: number;
      failed: number;
      dispatched: number;
    };
    payments: Record<string, number>;
    notifications: Record<string, number>;
  }> {
    const [pendingOutbox, failedOutbox, dispatchedOutbox, payments, notifications] =
      await Promise.all([
        db
          .selectFrom('outbox_events')
          .select(({ fn, ref }) => [fn.count<string>(ref('id')).as('count')])
          .where('tenant_id', '=', tenantId)
          .where('dispatched_at', 'is', null)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('outbox_events')
          .select(({ fn, ref }) => [fn.count<string>(ref('id')).as('count')])
          .where('tenant_id', '=', tenantId)
          .where('dispatched_at', 'is', null)
          .where('attempts', '>', 0)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('outbox_events')
          .select(({ fn, ref }) => [fn.count<string>(ref('id')).as('count')])
          .where('tenant_id', '=', tenantId)
          .where('dispatched_at', 'is not', null)
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('payment_intents')
          .select(({ fn, ref }) => ['status', fn.count<string>(ref('id')).as('count')])
          .where('tenant_id', '=', tenantId)
          .groupBy('status')
          .orderBy('status', 'asc')
          .execute(),
        db
          .selectFrom('notification_jobs')
          .select(({ fn, ref }) => ['status', fn.count<string>(ref('id')).as('count')])
          .where('tenant_id', '=', tenantId)
          .groupBy('status')
          .orderBy('status', 'asc')
          .execute()
      ]);

    return {
      outbox: {
        pending: Number(pendingOutbox.count),
        failed: Number(failedOutbox.count),
        dispatched: Number(dispatchedOutbox.count)
      },
      payments: Object.fromEntries(payments.map((row) => [row.status, Number(row.count)])),
      notifications: Object.fromEntries(notifications.map((row) => [row.status, Number(row.count)]))
    };
  },

  async listOutboxEvents(input: {
    tenantId: string;
    status?: OpsOutboxStatus;
    eventType?: string;
    limit: number;
  }) {
    let query = db
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
        'last_error',
        'created_at'
      ])
      .where('tenant_id', '=', input.tenantId)
      .orderBy('created_at', 'desc')
      .limit(input.limit);

    if (input.eventType !== undefined) {
      query = query.where('event_type', '=', input.eventType);
    }

    if (input.status === 'pending') {
      query = query.where('dispatched_at', 'is', null).where('attempts', '=', 0);
    } else if (input.status === 'failed') {
      query = query.where('dispatched_at', 'is', null).where('attempts', '>', 0);
    } else if (input.status === 'dispatched') {
      query = query.where('dispatched_at', 'is not', null);
    }

    return query.execute();
  },

  async listPaymentIntents(input: {
    tenantId: string;
    status?: PaymentIntentStatus;
    limit: number;
  }) {
    let query = db
      .selectFrom('payment_intents')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .orderBy('created_at', 'desc')
      .limit(input.limit);

    if (input.status !== undefined) {
      query = query.where('status', '=', input.status);
    }

    return query.execute();
  },

  async listNotificationJobs(input: {
    tenantId: string;
    status?: NotificationJobStatus;
    limit: number;
  }) {
    let query = db
      .selectFrom('notification_jobs')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .orderBy('created_at', 'desc')
      .limit(input.limit);

    if (input.status !== undefined) {
      query = query.where('status', '=', input.status);
    }

    return query.execute();
  },

  async getNotificationJob(tenantId: string, jobId: string) {
    return (
      (await db
        .selectFrom('notification_jobs')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', jobId)
        .executeTakeFirst()) ?? null
    );
  },

  async listNotificationAttempts(input: { tenantId: string; jobId: string; limit: number }) {
    return db
      .selectFrom('notification_delivery_attempts')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .where('job_id', '=', input.jobId)
      .orderBy('attempt_number', 'desc')
      .limit(input.limit)
      .execute();
  }
});
