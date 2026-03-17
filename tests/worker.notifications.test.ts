import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createDbClient, sql } from '@hypermarket/core/db';

import {
  NOTIFICATION_DISPATCH_DLQ,
  NOTIFICATION_DISPATCH_QUEUE,
  enqueueNotificationDispatchJobs,
  handleNotificationDispatchFailure
} from '../apps/worker/src/notifications';

const ensureNotificationWorkerTables = async (
  db: ReturnType<typeof createDbClient>
): Promise<void> => {
  await sql`
    create table if not exists tenants (
      id uuid primary key,
      slug text not null,
      business_name text not null,
      status text not null,
      default_currency text not null,
      active_config_id uuid null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists outbox_events (
      id uuid primary key,
      event_type text not null,
      tenant_id uuid null references tenants(id) on delete cascade,
      correlation_id text null,
      actor_user_id uuid null,
      payload jsonb not null,
      occurred_at timestamptz not null,
      available_at timestamptz not null,
      dispatched_at timestamptz null,
      attempts integer not null default 0,
      last_error text null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table if not exists notification_jobs (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      event_id uuid not null references outbox_events(id) on delete cascade,
      event_type text not null,
      channel text not null,
      recipient text not null,
      template_id text not null,
      template_version integer not null,
      payload jsonb not null,
      dedupe_key text not null,
      status text not null,
      attempt_count integer not null default 0,
      last_error_code text null,
      last_error_message text null,
      provider text null,
      provider_message_id text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create unique index if not exists notification_jobs_dedupe_key_unique
    on notification_jobs (dedupe_key)
  `.execute(db);
};

describe('worker notification queue', () => {
  it('enqueues notification jobs with retry options', async () => {
    const add = vi.fn().mockResolvedValue(undefined);

    const queued = await enqueueNotificationDispatchJobs(
      { add },
      {
        tenantId: 'tenant-1',
        jobIds: ['job-1', 'job-2']
      }
    );

    expect(queued).toBe(2);
    expect(add).toHaveBeenNthCalledWith(
      1,
      NOTIFICATION_DISPATCH_QUEUE,
      {
        job_id: 'job-1',
        tenant_id: 'tenant-1'
      },
      expect.objectContaining({
        attempts: 8,
        backoff: {
          type: 'exponential',
          delay: 30000
        }
      })
    );
  });

  it('moves permanently failed notification jobs to the dlq', async () => {
    const db = createDbClient(
      process.env.DATABASE_URL ?? 'postgres://hypermarket:hypermarket@localhost:5432/hypermarket'
    );
    const outboxId = randomUUID();
    const jobId = randomUUID();
    const tenantId = randomUUID();
    const dlqAdd = vi.fn().mockResolvedValue(undefined);
    const logger = {
      error: vi.fn()
    };

    try {
      await ensureNotificationWorkerTables(db);

      await db
        .insertInto('tenants')
        .values({
          id: tenantId,
          slug: `tenant-${jobId.slice(0, 8)}`,
          business_name: 'Notifications Tenant',
          status: 'active',
          default_currency: 'UGX',
          active_config_id: null,
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute();

      await db
        .insertInto('outbox_events')
        .values({
          id: outboxId,
          event_type: 'Payment.Succeeded',
          tenant_id: tenantId,
          correlation_id: null,
          actor_user_id: null,
          payload: {
            tenant_id: tenantId
          },
          occurred_at: new Date(),
          available_at: new Date(),
          dispatched_at: null,
          attempts: 0,
          last_error: null,
          created_at: new Date()
        })
        .execute();

      await db
        .insertInto('notification_jobs')
        .values({
          id: jobId,
          tenant_id: tenantId,
          event_id: outboxId,
          event_type: 'Payment.Succeeded',
          channel: 'sms',
          recipient: '+256712345678',
          template_id: 'payment.succeeded.customer',
          template_version: 1,
          payload: {
            order_number: 55,
            total_amount: 2000,
            currency: 'UGX',
            store_name: 'Sunrise Fresh'
          },
          dedupe_key: randomUUID(),
          status: 'FAILED_RETRYABLE',
          attempt_count: 8,
          last_error_code: 'not_send_failed_retryable',
          last_error_message: 'retryable failure',
          provider: 'twilio_sms',
          provider_message_id: null,
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute();

      await handleNotificationDispatchFailure({
        db,
        dlq: { add: dlqAdd },
        logger,
        job: {
          id: 'bull-job-1',
          name: NOTIFICATION_DISPATCH_QUEUE,
          data: {
            job_id: jobId,
            tenant_id: tenantId
          },
          attemptsMade: 8,
          opts: { attempts: 8 }
        },
        error: new Error('provider timeout')
      });

      expect(dlqAdd).toHaveBeenCalledWith(
        NOTIFICATION_DISPATCH_DLQ,
        expect.objectContaining({
          job_id: jobId,
          tenant_id: tenantId,
          error_message: 'provider timeout'
        })
      );

      const persisted = await db
        .selectFrom('notification_jobs')
        .select(['status', 'last_error_message'])
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow();

      expect(persisted).toMatchObject({
        status: 'DEAD',
        last_error_message: 'provider timeout'
      });
    } finally {
      await db.deleteFrom('notification_jobs').where('tenant_id', '=', tenantId).execute();
      await db.deleteFrom('outbox_events').where('tenant_id', '=', tenantId).execute();
      await db.deleteFrom('tenants').where('id', '=', tenantId).execute();
      await db.destroy();
    }
  });
});
