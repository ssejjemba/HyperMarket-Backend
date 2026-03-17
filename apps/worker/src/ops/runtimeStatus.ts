import { loadEnv } from '@hypermarket/core';

import {
  closeQueues,
  createOutboxStatusReporter,
  createQueueClients,
  resolveQueueTarget,
  summarizeQueueCounts
} from './runtimeOps';
import { loadWorkerEnv } from './loadWorkerEnv';

const main = async (): Promise<void> => {
  loadWorkerEnv();
  const config = loadEnv();
  const notifications = createQueueClients(config.redisUrl, resolveQueueTarget('notifications'));
  const revalidation = createQueueClients(config.redisUrl, resolveQueueTarget('revalidation'));
  const outbox = createOutboxStatusReporter(config.databaseUrl);

  try {
    const [notificationCounts, revalidationCounts, outboxStatus] = await Promise.all([
      summarizeQueueCounts(notifications.primary, notifications.dlq),
      summarizeQueueCounts(revalidation.primary, revalidation.dlq),
      outbox.fetch()
    ]);

    console.log(
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          queues: {
            notifications: notificationCounts,
            revalidation: revalidationCounts
          },
          outbox: outboxStatus
        },
        null,
        2
      )
    );
  } finally {
    await Promise.all([closeQueues(notifications), closeQueues(revalidation), outbox.close()]);
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
