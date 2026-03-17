import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sql } from '@hypermarket/core';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('NOT persistence schema', () => {
  it('enforces notification job dedupe keys and persists attempts', async () => {
    const ctx = await createTestContext();
    const outboxId = randomUUID();
    const dedupeKey = 'dedupe-key-1';

    try {
      await ctx.db
        .insertInto('outbox_events')
        .values({
          id: outboxId,
          event_type: 'Order.Created',
          tenant_id: ctx.seed.tenantId,
          correlation_id: null,
          actor_user_id: null,
          payload: {
            tenant_id: ctx.seed.tenantId
          },
          occurred_at: new Date(),
          available_at: new Date(),
          dispatched_at: null,
          attempts: 0,
          last_error: null,
          created_at: new Date()
        })
        .execute();

      const first = await ctx.db
        .insertInto('notification_jobs')
        .values({
          id: randomUUID(),
          tenant_id: ctx.seed.tenantId,
          event_id: outboxId,
          event_type: 'Order.Created',
          channel: 'sms',
          recipient: '+256712345678',
          template_id: 'order.created.customer',
          template_version: 1,
          payload: {
            order_number: 101
          },
          dedupe_key: dedupeKey,
          status: 'PENDING',
          attempt_count: 0,
          last_error_code: null,
          last_error_message: null,
          provider: null,
          provider_message_id: null,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning(['id', 'status'])
        .executeTakeFirstOrThrow();

      expect(first.status).toBe('PENDING');

      await expect(
        ctx.db
          .insertInto('notification_jobs')
          .values({
            id: randomUUID(),
            tenant_id: ctx.seed.tenantId,
            event_id: outboxId,
            event_type: 'Order.Created',
            channel: 'sms',
            recipient: '+256712345678',
            template_id: 'order.created.customer',
            template_version: 1,
            payload: {
              order_number: 101
            },
            dedupe_key: dedupeKey,
            status: 'PENDING',
            attempt_count: 0,
            last_error_code: null,
            last_error_message: null,
            provider: null,
            provider_message_id: null,
            created_at: new Date(),
            updated_at: new Date()
          })
          .execute()
      ).rejects.toThrow();

      await ctx.db
        .insertInto('notification_delivery_attempts')
        .values({
          id: randomUUID(),
          tenant_id: ctx.seed.tenantId,
          job_id: first.id,
          attempt_number: 1,
          provider: 'twilio_sms',
          result: 'success',
          error_code: null,
          error_message: null,
          provider_message_id: 'SM123',
          created_at: new Date()
        })
        .execute();

      const storedAttempt = await ctx.db
        .selectFrom('notification_delivery_attempts')
        .select(['attempt_number', 'provider', 'result', 'provider_message_id'])
        .where('job_id', '=', first.id)
        .executeTakeFirstOrThrow();

      expect(storedAttempt).toMatchObject({
        attempt_number: 1,
        provider: 'twilio_sms',
        result: 'success',
        provider_message_id: 'SM123'
      });

      const persistedJob = await ctx.db
        .selectFrom('notification_jobs')
        .select(['status', 'attempt_count'])
        .where('id', '=', first.id)
        .executeTakeFirstOrThrow();

      expect(persistedJob).toMatchObject({
        status: 'PENDING',
        attempt_count: 0
      });
    } finally {
      await ctx.destroy();
    }
  });

  it('supports notification job status persistence', async () => {
    const ctx = await createTestContext();
    const outboxId = randomUUID();
    const jobId = randomUUID();

    try {
      await ctx.db
        .insertInto('outbox_events')
        .values({
          id: outboxId,
          event_type: 'Payment.Succeeded',
          tenant_id: ctx.seed.tenantId,
          correlation_id: null,
          actor_user_id: null,
          payload: {
            tenant_id: ctx.seed.tenantId
          },
          occurred_at: new Date(),
          available_at: new Date(),
          dispatched_at: null,
          attempts: 0,
          last_error: null,
          created_at: new Date()
        })
        .execute();

      await ctx.db
        .insertInto('notification_jobs')
        .values({
          id: jobId,
          tenant_id: ctx.seed.tenantId,
          event_id: outboxId,
          event_type: 'Payment.Succeeded',
          channel: 'sms',
          recipient: '+256712345678',
          template_id: 'payment.succeeded.customer',
          template_version: 1,
          payload: {
            order_number: 44
          },
          dedupe_key: 'dedupe-key-2',
          status: 'PROCESSING',
          attempt_count: 1,
          last_error_code: null,
          last_error_message: null,
          provider: 'twilio_sms',
          provider_message_id: null,
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute();

      await ctx.db
        .updateTable('notification_jobs')
        .set({
          status: 'SENT',
          attempt_count: 1,
          provider_message_id: 'SM999',
          updated_at: sql`now()`
        })
        .where('id', '=', jobId)
        .execute();

      const persisted = await ctx.db
        .selectFrom('notification_jobs')
        .select(['status', 'attempt_count', 'provider', 'provider_message_id'])
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow();

      expect(persisted).toMatchObject({
        status: 'SENT',
        attempt_count: 1,
        provider: 'twilio_sms',
        provider_message_id: 'SM999'
      });
    } finally {
      await ctx.destroy();
    }
  });
});
