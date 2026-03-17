import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '@hypermarket/core';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { createNotificationUseCases } from '@hypermarket/modules/notifications';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('NOT use cases', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  afterEach(async () => {
    if (ctx !== undefined) {
      await ctx.destroy();
    }
  });

  it('schedules jobs from outbox events and dedupes duplicate inserts', async () => {
    ctx = await createTestContext();
    const logger = createLogger({ config: ctx.config, base: { service: 'test' } });
    const useCases = createNotificationUseCases({
      db: ctx.db,
      logger
    });
    const outboxId = randomUUID();

    await ctx.db
      .insertInto('outbox_events')
      .values({
        id: outboxId,
        event_type: 'Order.Created',
        tenant_id: ctx.seed.tenantId,
        correlation_id: null,
        actor_user_id: null,
        payload: {
          tenant_id: ctx.seed.tenantId,
          order_number: 10,
          total_amount: 5000,
          currency: 'UGX',
          store_name: 'Sunrise Fresh',
          fulfillment_type: 'pickup',
          customer_phone_e164: '+256712345678',
          merchant_phone_e164: '+256772345678'
        },
        occurred_at: new Date(),
        available_at: new Date(),
        dispatched_at: null,
        attempts: 0,
        last_error: null,
        created_at: new Date()
      })
      .execute();

    const event = await ctx.db
      .selectFrom('outbox_events')
      .selectAll()
      .where('id', '=', outboxId)
      .executeTakeFirstOrThrow();

    const first = await useCases.scheduleFromOutboxEvent({
      id: event.id,
      eventType: event.event_type,
      tenantId: event.tenant_id,
      correlationId: event.correlation_id,
      actorUserId: event.actor_user_id,
      payload: event.payload,
      occurredAt: event.occurred_at,
      availableAt: event.available_at,
      dispatchedAt: event.dispatched_at,
      attempts: event.attempts,
      lastError: event.last_error,
      createdAt: event.created_at
    });
    expect(first).toMatchObject({
      createdCount: 2,
      dedupedCount: 0
    });

    const replay = await useCases.scheduleFromOutboxEvent({
      id: event.id,
      eventType: event.event_type,
      tenantId: event.tenant_id,
      correlationId: event.correlation_id,
      actorUserId: event.actor_user_id,
      payload: event.payload,
      occurredAt: event.occurred_at,
      availableAt: event.available_at,
      dispatchedAt: event.dispatched_at,
      attempts: event.attempts,
      lastError: event.last_error,
      createdAt: event.created_at
    });
    expect(replay).toMatchObject({
      createdCount: 0,
      dedupedCount: 2
    });
  });

  it('dispatches jobs and records delivery attempts', async () => {
    ctx = await createTestContext();
    const logger = createLogger({ config: ctx.config, base: { service: 'test' } });
    const dispatchMessage = vi.fn().mockResolvedValue({
      status: 'SENT',
      provider: 'fake_sms',
      providerMessageId: 'MSG-1',
      retryable: false
    });
    const useCases = createNotificationUseCases({
      db: ctx.db,
      logger,
      dispatchMessage
    });
    const outboxId = randomUUID();

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

    const insertedJob = await ctx.db
      .insertInto('notification_jobs')
      .values({
        id: randomUUID(),
        tenant_id: ctx.seed.tenantId,
        event_id: outboxId,
        event_type: 'Payment.Succeeded',
        channel: 'sms',
        recipient: '+256712345678',
        template_id: 'payment.succeeded.customer',
        template_version: 1,
        payload: {
          order_number: 44,
          total_amount: 15000,
          currency: 'UGX',
          store_name: 'Sunrise Fresh'
        },
        dedupe_key: randomUUID(),
        status: 'PENDING',
        attempt_count: 0,
        last_error_code: null,
        last_error_message: null,
        provider: null,
        provider_message_id: null,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const result = await useCases.dispatchJob(insertedJob.id);
    expect(result).toMatchObject({
      status: 'SENT',
      provider: 'fake_sms',
      providerMessageId: 'MSG-1'
    });

    const attempts = await ctx.db
      .selectFrom('notification_delivery_attempts')
      .select(['attempt_number', 'provider', 'result', 'provider_message_id'])
      .where('job_id', '=', insertedJob.id)
      .execute();

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attempt_number: 1,
      provider: 'fake_sms',
      result: 'success',
      provider_message_id: 'MSG-1'
    });
  });
});
