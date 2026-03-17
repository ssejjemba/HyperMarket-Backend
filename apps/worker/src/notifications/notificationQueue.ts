import type { JobsOptions, Job, Queue } from 'bullmq';

import type { createDbClient } from '@hypermarket/core';
import { createNotificationRepoPg } from '../../../../packages/modules/src/notifications/index';

export type NotificationDispatchJobPayload = {
  job_id: string;
  tenant_id: string;
};

export const NOTIFICATION_DISPATCH_QUEUE = 'notifications.dispatch';
export const NOTIFICATION_DISPATCH_DLQ = 'notifications.dispatch.dlq';

const NOTIFICATION_JOB_OPTIONS: JobsOptions = {
  attempts: 8,
  backoff: {
    type: 'exponential',
    delay: 30_000
  },
  removeOnComplete: 1000
};

export const enqueueNotificationDispatchJobs = async (
  queue: Pick<Queue<NotificationDispatchJobPayload>, 'add'>,
  input: {
    tenantId: string;
    jobIds: string[];
  }
): Promise<number> => {
  let queued = 0;

  for (const jobId of input.jobIds) {
    await queue.add(
      NOTIFICATION_DISPATCH_QUEUE,
      {
        job_id: jobId,
        tenant_id: input.tenantId
      },
      NOTIFICATION_JOB_OPTIONS
    );
    queued += 1;
  }

  return queued;
};

export const handleNotificationDispatchFailure = async (deps: {
  db: ReturnType<typeof createDbClient>;
  dlq: Pick<Queue, 'add'>;
  logger: { error(bindings: Record<string, unknown>, message: string): void };
  job: Pick<Job<NotificationDispatchJobPayload>, 'id' | 'name' | 'data' | 'attemptsMade' | 'opts'>;
  error: unknown;
}): Promise<void> => {
  const attempts = deps.job.opts.attempts ?? 1;
  if (deps.job.attemptsMade < attempts) {
    return;
  }

  const message = deps.error instanceof Error ? deps.error.message : 'unknown_error';
  const repo = createNotificationRepoPg(deps.db);
  const existing = await repo.getJobById(deps.job.data.job_id);
  if (existing !== null && existing.status !== 'DEAD') {
    await repo.updateJob({
      jobId: existing.id,
      status: 'DEAD',
      attemptCount: existing.attemptCount,
      lastErrorCode: existing.lastErrorCode ?? 'not_send_failed_retryable',
      lastErrorMessage: message,
      provider: existing.provider,
      providerMessageId: existing.providerMessageId
    });
  }

  await deps.dlq.add(NOTIFICATION_DISPATCH_DLQ, {
    ...deps.job.data,
    error_message: message
  });

  deps.logger.error(
    {
      jobId: deps.job.id,
      queueName: deps.job.name,
      tenantId: deps.job.data.tenant_id,
      attemptsMade: deps.job.attemptsMade,
      errorMessage: message
    },
    'Notification dispatch moved to DLQ'
  );
};
