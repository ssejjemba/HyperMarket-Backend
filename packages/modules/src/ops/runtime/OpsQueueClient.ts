import { Queue } from 'bullmq';

export type OpsQueueTarget = 'notifications' | 'revalidation';

type QueueDetails = {
  primary: string;
  dlq: string;
};

const QUEUES: Record<OpsQueueTarget, QueueDetails> = {
  notifications: {
    primary: 'notifications.dispatch',
    dlq: 'notifications.dispatch.dlq'
  },
  revalidation: {
    primary: 'storefront.revalidate',
    dlq: 'storefront.revalidate.dlq'
  }
};

const createConnection = (redisUrl: string) => {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    maxRetriesPerRequest: null
  };
};

const sanitizeReplayData = (data: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...data };
  delete next.error_message;
  return next;
};

export const createOpsQueueClient = (redisUrl: string) => {
  const connection = createConnection(redisUrl);
  const queues = new Map<string, Queue>();

  const getQueue = (name: string): Queue => {
    const existing = queues.get(name);
    if (existing !== undefined) {
      return existing;
    }

    const created = new Queue(name, { connection });
    queues.set(name, created);
    return created;
  };

  const getTenantId = (data: Record<string, unknown>): string | null =>
    typeof data.tenant_id === 'string' ? data.tenant_id : null;

  return {
    async listTenantDlqJobs(input: { target: OpsQueueTarget; tenantId: string; limit: number }) {
      const target = QUEUES[input.target];
      const jobs = await getQueue(target.dlq).getJobs(
        ['wait', 'delayed', 'prioritized'],
        0,
        Math.max(Math.min(input.limit * 20, 199), input.limit - 1),
        true
      );

      return jobs
        .filter((job) => getTenantId(job.data as Record<string, unknown>) === input.tenantId)
        .slice(0, input.limit)
        .map((job) => ({
          id: job.id?.toString() ?? null,
          name: job.name,
          attempts_made: job.attemptsMade,
          timestamp: job.timestamp,
          data: job.data as Record<string, unknown>
        }));
    },

    async replayTenantDlqJob(input: {
      target: OpsQueueTarget;
      tenantId: string;
      jobId: string;
    }): Promise<{ replayed: boolean; reason?: 'not_found' | 'tenant_mismatch' }> {
      const target = QUEUES[input.target];
      const dlq = getQueue(target.dlq);
      const primary = getQueue(target.primary);
      const job = await dlq.getJob(input.jobId);

      if (job === undefined || job === null) {
        return { replayed: false, reason: 'not_found' };
      }

      const data = job.data as Record<string, unknown>;
      if (getTenantId(data) !== input.tenantId) {
        return { replayed: false, reason: 'tenant_mismatch' };
      }

      await primary.add(target.primary, sanitizeReplayData(data));
      await job.remove();

      return { replayed: true };
    },

    async close(): Promise<void> {
      await Promise.all(Array.from(queues.values()).map((queue) => queue.close()));
    }
  };
};
