import { Queue, type QueueOptions } from 'bullmq';

import { createDbClient } from '@hypermarket/core';

import { NOTIFICATION_DISPATCH_DLQ, NOTIFICATION_DISPATCH_QUEUE } from '../notifications';
import { STOREFRONT_REVALIDATION_DLQ, STOREFRONT_REVALIDATION_QUEUE } from '../revalidation';

type QueueTarget = 'notifications' | 'revalidation';

type QueueDetails = {
  label: QueueTarget;
  primary: string;
  dlq: string;
};

const QUEUE_TARGETS: Record<QueueTarget, QueueDetails> = {
  notifications: {
    label: 'notifications',
    primary: NOTIFICATION_DISPATCH_QUEUE,
    dlq: NOTIFICATION_DISPATCH_DLQ
  },
  revalidation: {
    label: 'revalidation',
    primary: STOREFRONT_REVALIDATION_QUEUE,
    dlq: STOREFRONT_REVALIDATION_DLQ
  }
};

export const resolveQueueTarget = (value: string): QueueDetails => {
  if (value === 'notifications' || value === 'revalidation') {
    return QUEUE_TARGETS[value];
  }

  throw new Error(`Unknown queue target "${value}". Expected notifications or revalidation.`);
};

export const createBullMqConnection = (redisUrl: string): QueueOptions['connection'] => {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    maxRetriesPerRequest: null
  };
};

export const createQueueClients = (
  redisUrl: string,
  target: QueueDetails
): {
  primary: Queue;
  dlq: Queue;
} => {
  const connection = createBullMqConnection(redisUrl);
  return {
    primary: new Queue(target.primary, { connection }),
    dlq: new Queue(target.dlq, { connection })
  };
};

export const closeQueues = async (queues: { primary: Queue; dlq: Queue }): Promise<void> => {
  await Promise.all([queues.primary.close(), queues.dlq.close()]);
};

export const listDlqJobs = async (
  dlq: Pick<Queue, 'getJobs'>,
  limit: number
): Promise<
  Array<{
    id: string | undefined;
    name: string;
    attemptsMade: number;
    timestamp: number;
    data: Record<string, unknown>;
  }>
> => {
  const jobs = await dlq.getJobs(
    ['wait', 'delayed', 'prioritized'],
    0,
    Math.max(limit - 1, 0),
    true
  );
  return jobs.map((job) => ({
    id: job.id?.toString(),
    name: job.name,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    data: job.data as Record<string, unknown>
  }));
};

const sanitizeReplayData = (data: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...data };
  delete next.error_message;
  return next;
};

export const replayDlqJob = async (
  deps: {
    primary: Pick<Queue, 'add'>;
    dlq: Pick<Queue, 'getJob'>;
  },
  input: {
    target: QueueDetails;
    jobId: string;
  }
): Promise<{ replayed: boolean; reason?: string }> => {
  const job = await deps.dlq.getJob(input.jobId);
  if (job === undefined || job === null) {
    return { replayed: false, reason: 'not_found' };
  }

  await deps.primary.add(
    input.target.primary,
    sanitizeReplayData(job.data as Record<string, unknown>)
  );
  await job.remove();
  return { replayed: true };
};

export const createOutboxStatusReporter = (databaseUrl: string) => {
  const db = createDbClient(databaseUrl);

  return {
    async fetch() {
      const pendingByType = await db
        .selectFrom('outbox_events')
        .select(({ fn, ref }) => [
          'event_type as eventType',
          fn.count<string>(ref('id')).as('count')
        ])
        .where('dispatched_at', 'is', null)
        .groupBy('event_type')
        .orderBy('event_type', 'asc')
        .execute();

      const failed = await db
        .selectFrom('outbox_events')
        .select(({ fn, ref }) => [fn.count<string>(ref('id')).as('count')])
        .where('dispatched_at', 'is', null)
        .where('attempts', '>', 0)
        .executeTakeFirstOrThrow();

      const oldestPending = await db
        .selectFrom('outbox_events')
        .select([
          'id',
          'event_type as eventType',
          'tenant_id as tenantId',
          'created_at as createdAt'
        ])
        .where('dispatched_at', 'is', null)
        .orderBy('created_at', 'asc')
        .executeTakeFirst();

      return {
        pendingByType: pendingByType.map((row) => ({
          eventType: row.eventType,
          count: Number(row.count)
        })),
        failedCount: Number(failed.count),
        oldestPending:
          oldestPending === undefined
            ? null
            : {
                id: oldestPending.id,
                eventType: oldestPending.eventType,
                tenantId: oldestPending.tenantId,
                createdAt: oldestPending.createdAt.toISOString()
              }
      };
    },
    async close() {
      await db.destroy();
    }
  };
};

export const summarizeQueueCounts = async (
  queue: Pick<Queue, 'getJobCounts'>,
  dlq: Pick<Queue, 'getJobCounts'>
) => {
  const [primary, deadLetter] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused'),
    dlq.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused')
  ]);

  return {
    primary,
    dlq: deadLetter
  };
};

export type { QueueTarget };
