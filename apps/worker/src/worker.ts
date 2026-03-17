import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Queue, Worker } from 'bullmq';
import { config as loadDotenv } from 'dotenv';

import {
  createDbClient,
  createLogger,
  createOutboxDispatcher,
  loadEnv,
  withRequestContext
} from '@hypermarket/core';
import {
  createNotificationUseCases,
  createTwilioSmsProvider
} from '../../../packages/modules/src/notifications/index';

import {
  STOREFRONT_REVALIDATION_DLQ,
  STOREFRONT_REVALIDATION_QUEUE,
  createNoopStorefrontRevalidationMetrics,
  createStorefrontRevalidationClient,
  enqueueStorefrontRevalidationJob,
  handleStorefrontRevalidationFailure
} from './revalidation';
import {
  NOTIFICATION_DISPATCH_DLQ,
  NOTIFICATION_DISPATCH_QUEUE,
  enqueueNotificationDispatchJobs,
  handleNotificationDispatchFailure
} from './notifications';

const resolveRootDir = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../..');
};

const loadConfig = () => {
  const rootDir = resolveRootDir();
  loadDotenv({ path: path.join(rootDir, '.env.example') });
  loadDotenv({ path: path.join(rootDir, '.env'), override: true });

  return loadEnv();
};

const loadStorefrontRevalidationConfig = (): {
  url: string;
  token: string;
} => {
  const url = process.env.STOREFRONT_REVALIDATION_URL;
  const token = process.env.STOREFRONT_REVALIDATION_TOKEN;
  const errors: string[] = [];

  if (url === undefined || url.length === 0) {
    errors.push('- STOREFRONT_REVALIDATION_URL: Required');
  } else {
    try {
      new URL(url);
    } catch {
      errors.push('- STOREFRONT_REVALIDATION_URL: Must be a valid URL');
    }
  }

  if (token === undefined || token.length === 0) {
    errors.push('- STOREFRONT_REVALIDATION_TOKEN: Required');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid storefront revalidation configuration:\n${errors.join('\n')}`);
  }

  return {
    url: url as string,
    token: token as string
  };
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const startWorker = async (): Promise<void> => {
  const config = loadConfig();
  const storefrontRevalidationConfig = loadStorefrontRevalidationConfig();
  const logger = createLogger({ config, base: { service: 'worker' } });
  const db = createDbClient(config.databaseUrl);
  const bullmqConnection = {
    host: new URL(config.redisUrl).hostname,
    port: Number(new URL(config.redisUrl).port || 6379),
    maxRetriesPerRequest: null as null
  };

  const outboxDispatcher = createOutboxDispatcher({ batchSize: 50 });
  const revalidationMetrics = createNoopStorefrontRevalidationMetrics();
  const storefrontRevalidationQueue = new Queue(STOREFRONT_REVALIDATION_QUEUE, {
    connection: bullmqConnection
  });
  const storefrontRevalidationDlq = new Queue(STOREFRONT_REVALIDATION_DLQ, {
    connection: bullmqConnection
  });
  const storefrontRevalidationClient = createStorefrontRevalidationClient({
    url: storefrontRevalidationConfig.url,
    token: storefrontRevalidationConfig.token,
    logger
  });
  const storefrontRevalidationWorker = new Worker(
    STOREFRONT_REVALIDATION_QUEUE,
    async (job) => {
      await storefrontRevalidationClient.revalidate(job.data);
    },
    {
      connection: bullmqConnection
    }
  );
  const notificationDispatchQueue = new Queue(NOTIFICATION_DISPATCH_QUEUE, {
    connection: bullmqConnection
  });
  const notificationDispatchDlq = new Queue(NOTIFICATION_DISPATCH_DLQ, {
    connection: bullmqConnection
  });
  const notificationUseCases = createNotificationUseCases({
    db,
    logger,
    provider: createTwilioSmsProvider({
      accountSid: config.twilioAccountSid,
      authToken: config.twilioAuthToken,
      from: config.twilioSmsFrom
    })
  });
  const notificationDispatchWorker = new Worker(
    NOTIFICATION_DISPATCH_QUEUE,
    async (job) => {
      const result = await notificationUseCases.dispatchJob(job.data.job_id);

      if (result.status === 'FAILED_RETRYABLE') {
        throw new Error(result.lastErrorMessage ?? 'notification_retryable_failure');
      }

      if (result.status === 'DEAD') {
        await notificationDispatchDlq.add(NOTIFICATION_DISPATCH_DLQ, {
          ...job.data,
          error_message: result.lastErrorMessage ?? 'notification_dead'
        });
      }
    },
    {
      connection: bullmqConnection
    }
  );

  storefrontRevalidationWorker.on('failed', async (job, error) => {
    if (job === undefined) {
      return;
    }

    await handleStorefrontRevalidationFailure({
      dlq: storefrontRevalidationDlq,
      metrics: revalidationMetrics,
      logger,
      job,
      error
    });
  });
  notificationDispatchWorker.on('failed', async (job, error) => {
    if (job === undefined) {
      return;
    }

    await handleNotificationDispatchFailure({
      db,
      dlq: notificationDispatchDlq,
      logger,
      job,
      error
    });
  });

  logger.info('Worker started');

  const pollOutbox = async (): Promise<void> => {
    while (true) {
      try {
        const pending = await outboxDispatcher.fetchPending(db);
        if (pending.length === 0) {
          await sleep(1000);
          continue;
        }

        for (const event of pending) {
          const eventLogger = withRequestContext(logger, {
            requestId: event.id,
            traceId: event.correlationId ?? event.id,
            userId: event.actorUserId,
            tenantId: event.tenantId
          });

          try {
            eventLogger.info({ eventType: event.eventType }, 'Dispatching outbox event');
            await enqueueStorefrontRevalidationJob(storefrontRevalidationQueue, event);
            if ((event.tenantId ?? '').length > 0) {
              const scheduled = await notificationUseCases.scheduleFromOutboxEvent(event);
              if (scheduled.createdJobIds.length > 0) {
                await enqueueNotificationDispatchJobs(notificationDispatchQueue, {
                  tenantId: event.tenantId as string,
                  jobIds: scheduled.createdJobIds
                });
              }
            }
            await outboxDispatcher.markDispatched(db, [event.id]);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown_error';
            eventLogger.error({ err: error }, 'Outbox dispatch failed');
            await outboxDispatcher.markFailed(db, event.id, message);
          }
        }
      } catch (error) {
        logger.error({ err: error }, 'Outbox poll failed');
        await sleep(1000);
      }
    }
  };

  await Promise.all([
    storefrontRevalidationQueue.waitUntilReady(),
    storefrontRevalidationDlq.waitUntilReady(),
    storefrontRevalidationWorker.waitUntilReady(),
    notificationDispatchQueue.waitUntilReady(),
    notificationDispatchDlq.waitUntilReady(),
    notificationDispatchWorker.waitUntilReady(),
    pollOutbox()
  ]);
};

startWorker().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
