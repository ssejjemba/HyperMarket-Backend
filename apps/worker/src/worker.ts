import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import Redis from 'ioredis';

import {
  createDbClient,
  createLogger,
  createOutboxDispatcher,
  loadEnv,
  withRequestContext
} from '@hypermarket/core';

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

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const startWorker = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger({ config, base: { service: 'worker' } });
  const db = createDbClient(config.databaseUrl);
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2
  });

  const outboxDispatcher = createOutboxDispatcher({ batchSize: 50 });

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

  const startNotificationWorker = async (): Promise<void> => {
    const channel = 'notifications:placeholder';
    redis.on('error', (error) => {
      logger.warn({ err: error }, 'Redis connection error');
    });

    while (true) {
      try {
        if (redis.status !== 'ready') {
          await redis.connect();
        }

        await redis.subscribe(channel);

        redis.on('message', (messageChannel, payload) => {
          if (messageChannel === channel) {
            logger.info({ payload }, 'Received notification placeholder');
          }
        });

        break;
      } catch (error) {
        logger.warn({ err: error }, 'Redis not ready, retrying');
        await sleep(1000);
      }
    }
  };

  await Promise.all([pollOutbox(), startNotificationWorker()]);
};

startWorker().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
