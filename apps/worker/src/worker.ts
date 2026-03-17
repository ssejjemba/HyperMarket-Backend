import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Queue, Worker } from 'bullmq';
import { config as loadDotenv } from 'dotenv';

import {
  createDbClient,
  createLogger,
  createMetricsRegistry,
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
  createPrometheusStorefrontRevalidationMetrics,
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
import { createMetricsHttpServer } from './metricsServer';
import {
  createOutboxStatusReporter,
  createQueueClients,
  summarizeQueueCounts
} from './ops/runtimeOps';

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

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

const sleep = async (
  ms: number,
  deps: {
    isStopping: () => boolean;
    registerWakeup: (wakeup: (() => void) | null) => void;
  }
): Promise<void> =>
  new Promise((resolve) => {
    if (deps.isStopping()) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      deps.registerWakeup(null);
      resolve();
    }, ms);

    deps.registerWakeup(() => {
      clearTimeout(timer);
      deps.registerWakeup(null);
      resolve();
    });
  });

const startWorker = async (): Promise<void> => {
  const config = loadConfig();
  const storefrontRevalidationConfig = loadStorefrontRevalidationConfig();
  const logger = createLogger({ config, base: { service: 'worker' } });
  const db = createDbClient(config.databaseUrl);
  const metricsRegistry = createMetricsRegistry();
  const bullmqConnection = {
    host: new URL(config.redisUrl).hostname,
    port: Number(new URL(config.redisUrl).port || 6379),
    maxRetriesPerRequest: null as null
  };

  const outboxDispatcher = createOutboxDispatcher({ batchSize: 50 });
  const revalidationMetrics = createPrometheusStorefrontRevalidationMetrics(metricsRegistry);
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
  const outboxStatusReporter = createOutboxStatusReporter(config.databaseUrl);
  const queueClients = {
    notifications: createQueueClients(config.redisUrl, {
      label: 'notifications',
      primary: NOTIFICATION_DISPATCH_QUEUE,
      dlq: NOTIFICATION_DISPATCH_DLQ
    }),
    revalidation: createQueueClients(config.redisUrl, {
      label: 'revalidation',
      primary: STOREFRONT_REVALIDATION_QUEUE,
      dlq: STOREFRONT_REVALIDATION_DLQ
    })
  };
  metricsRegistry.registerCollector(async () => {
    const [notifications, revalidation, outbox] = await Promise.all([
      summarizeQueueCounts(queueClients.notifications.primary, queueClients.notifications.dlq),
      summarizeQueueCounts(queueClients.revalidation.primary, queueClients.revalidation.dlq),
      outboxStatusReporter.fetch()
    ]);

    const queueLines = [
      '# HELP worker_queue_jobs Queue jobs grouped by queue, kind, and state',
      '# TYPE worker_queue_jobs gauge'
    ];

    const appendQueueMetrics = (
      queue: 'notifications' | 'revalidation',
      kind: 'primary' | 'dlq',
      counts: Record<string, number>
    ) => {
      for (const [state, value] of Object.entries(counts)) {
        queueLines.push(
          `worker_queue_jobs{queue="${queue}",kind="${kind}",state="${state}"} ${value}`
        );
      }
    };

    appendQueueMetrics('notifications', 'primary', notifications.primary);
    appendQueueMetrics('notifications', 'dlq', notifications.dlq);
    appendQueueMetrics('revalidation', 'primary', revalidation.primary);
    appendQueueMetrics('revalidation', 'dlq', revalidation.dlq);

    const outboxLines = [
      '# HELP worker_outbox_pending_total Pending outbox events grouped by event type',
      '# TYPE worker_outbox_pending_total gauge'
    ];

    for (const item of outbox.pendingByType) {
      outboxLines.push(`worker_outbox_pending_total{event_type="${item.eventType}"} ${item.count}`);
    }

    outboxLines.push('# HELP worker_outbox_failed_total Pending outbox events with retry attempts');
    outboxLines.push('# TYPE worker_outbox_failed_total gauge');
    outboxLines.push(`worker_outbox_failed_total ${outbox.failedCount}`);
    outboxLines.push(
      '# HELP worker_outbox_oldest_pending_age_seconds Age of the oldest pending outbox event'
    );
    outboxLines.push('# TYPE worker_outbox_oldest_pending_age_seconds gauge');
    outboxLines.push(
      `worker_outbox_oldest_pending_age_seconds ${
        outbox.oldestPending === null
          ? 0
          : Math.max(
              0,
              Math.floor((Date.now() - new Date(outbox.oldestPending.createdAt).getTime()) / 1000)
            )
      }`
    );

    return [...queueLines, ...outboxLines].join('\n');
  });
  const metricsServer = createMetricsHttpServer({
    host: config.workerMetricsHost ?? '0.0.0.0',
    port: config.workerMetricsPort ?? 9464,
    registry: metricsRegistry,
    logger
  });
  let stopRequested = false;
  let wakeupPoller: (() => void) | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const registerWakeup = (wakeup: (() => void) | null) => {
    wakeupPoller = wakeup;
  };

  const requestShutdown = async (signal: string): Promise<void> => {
    if (shutdownPromise !== null) {
      return shutdownPromise;
    }

    stopRequested = true;
    wakeupPoller?.();
    logger.info({ signal }, 'Worker shutting down');

    shutdownPromise = Promise.allSettled([
      storefrontRevalidationWorker.close(),
      notificationDispatchWorker.close(),
      storefrontRevalidationQueue.close(),
      storefrontRevalidationDlq.close(),
      notificationDispatchQueue.close(),
      notificationDispatchDlq.close(),
      queueClients.notifications.primary.close(),
      queueClients.notifications.dlq.close(),
      queueClients.revalidation.primary.close(),
      queueClients.revalidation.dlq.close(),
      outboxStatusReporter.close(),
      metricsServer.close(),
      db.destroy()
    ]).then((results) => {
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected !== undefined && rejected.status === 'rejected') {
        throw rejected.reason;
      }
      logger.info({ signal }, 'Worker stopped');
    });

    return shutdownPromise;
  };

  const onSignal = (signal: ShutdownSignal) => {
    void requestShutdown(signal).then(
      () => {
        process.exit(0);
      },
      (error) => {
        logger.error({ err: error, signal }, 'Worker shutdown failed');
        process.exit(1);
      }
    );
  };

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

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
    while (!stopRequested) {
      try {
        const pending = await outboxDispatcher.fetchPending(db);
        if (pending.length === 0) {
          await sleep(1000, {
            isStopping: () => stopRequested,
            registerWakeup
          });
          continue;
        }

        for (const event of pending) {
          if (stopRequested) {
            break;
          }

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
        if (stopRequested) {
          break;
        }

        logger.error({ err: error }, 'Outbox poll failed');
        await sleep(1000, {
          isStopping: () => stopRequested,
          registerWakeup
        });
      }
    }
  };

  try {
    await Promise.all([
      metricsServer.start(),
      storefrontRevalidationQueue.waitUntilReady(),
      storefrontRevalidationDlq.waitUntilReady(),
      storefrontRevalidationWorker.waitUntilReady(),
      notificationDispatchQueue.waitUntilReady(),
      notificationDispatchDlq.waitUntilReady(),
      notificationDispatchWorker.waitUntilReady()
    ]);
    await pollOutbox();
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await requestShutdown('shutdown');
  }
};

startWorker().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
