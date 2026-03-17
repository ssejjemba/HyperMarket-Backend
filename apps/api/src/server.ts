import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import Fastify, { type FastifyRequest } from 'fastify';

import { loadEnv, type AppConfig } from '@hypermarket/core/config/loadEnv';
import { createDbClient, sql } from '@hypermarket/core/db';
import { createLogger, withRequestContext } from '@hypermarket/core/observability/logger';
import { createMetricsRegistry } from '@hypermarket/core';
import type { RequestContext } from '@hypermarket/core/observability/requestContext';
import { AppError, ErrorCode, errorToHttp } from '@hypermarket/contracts';
import { registerModules } from '@hypermarket/modules';
import { registerDevRoutes } from './devRoutes';

type ServerOptions = {
  config: AppConfig;
  devRoutesMode?: 'auto' | 'enabled' | 'disabled';
};

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

const createRequestContext = (requestId: string, traceId: string): RequestContext => {
  return {
    requestId,
    traceId
  };
};

const pingRedis = async (redisUrl: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const target = new URL(redisUrl);
    const socket = net.createConnection({
      host: target.hostname,
      port: Number(target.port || 6379)
    });

    const cleanup = () => {
      socket.removeAllListeners();
      socket.end();
      socket.destroy();
    };

    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });
    socket.on('data', (buffer) => {
      const response = buffer.toString('utf8');
      cleanup();
      if (response.startsWith('+PONG')) {
        resolve();
        return;
      }

      reject(new Error(`Unexpected Redis response: ${response}`));
    });
    socket.on('timeout', () => {
      cleanup();
      reject(new Error('Redis readiness timeout'));
    });
    socket.on('error', (error) => {
      cleanup();
      reject(error);
    });
  });

export const buildServer = ({ config, devRoutesMode = 'auto' }: ServerOptions) => {
  const logger = createLogger({ config, base: { service: 'api' } });
  const devRoutesEnabled =
    config.nodeEnv === 'development' &&
    (devRoutesMode === 'enabled' || (devRoutesMode === 'auto' && config.nodeEnv === 'development'));

  const app = Fastify({
    logger,
    genReqId: (req) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0) {
        return headerId;
      }

      return crypto.randomUUID();
    }
  });

  const db = createDbClient(config.databaseUrl);
  const metricsRegistry = createMetricsRegistry();

  app.addHook('onRequest', async (request, reply) => {
    const traceHeader = request.headers['x-trace-id'];
    const traceId =
      typeof traceHeader === 'string' && traceHeader.length > 0 ? traceHeader : request.id;
    const requestContext = createRequestContext(request.id, traceId);
    const contextualRequest = request as FastifyRequest & {
      requestContext?: RequestContext;
    };

    contextualRequest.requestContext = requestContext;
    request.log = withRequestContext(request.log, requestContext);
    reply.header('x-request-id', request.id);
  });

  app.get('/health', async (request) => {
    return {
      status: 'ok',
      request_id: request.id
    };
  });

  app.get('/health/live', async (request) => ({
    status: 'ok',
    request_id: request.id
  }));

  app.get('/health/ready', async (request, reply) => {
    const checks = {
      database: false,
      redis: false
    };

    try {
      await sql`select 1 as ok`.execute(db);
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      await pingRedis(config.redisUrl);
      checks.redis = true;
    } catch {
      checks.redis = false;
    }

    const ready = checks.database && checks.redis;
    if (!ready) {
      reply.status(503);
    }

    return {
      status: ready ? 'ready' : 'degraded',
      request_id: request.id,
      checks
    };
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return metricsRegistry.render();
  });

  void registerModules(app as unknown as Parameters<typeof registerModules>[0], {
    db,
    logger,
    config,
    metricsRegistry
  });

  if (devRoutesEnabled) {
    registerDevRoutes(app);
  }

  app.setErrorHandler(async (error, request, reply) => {
    const requestId = request.id;
    const appError =
      error instanceof AppError
        ? error
        : new AppError({
            code: ErrorCode.InternalError,
            message: 'Internal server error',
            details: { reason: error instanceof Error ? error.message : 'unknown_error' },
            cause: error
          });

    const { status, body } = errorToHttp(appError, requestId);

    request.log.error({ err: error, error_code: appError.code }, 'Request failed');
    reply.status(status).send(body);
  });

  app.addHook('onClose', async () => {
    await db.destroy();
  });

  return app;
};

const resolveRootDir = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../..');
};

const loadConfig = (): AppConfig => {
  const rootDir = resolveRootDir();
  loadDotenv({ path: path.join(rootDir, '.env.example') });
  loadDotenv({ path: path.join(rootDir, '.env'), override: true });

  try {
    return loadEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load environment';

    console.error(message);
    process.exit(1);
  }
};

const start = async (): Promise<void> => {
  const config = loadConfig();
  const server = buildServer({ config });
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = async (signal: ShutdownSignal): Promise<void> => {
    if (shutdownPromise !== null) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      server.log.info({ signal }, 'API server shutting down');
      await server.close();
      server.log.info({ signal }, 'API server stopped');
    })();

    return shutdownPromise;
  };

  const onSignal = (signal: ShutdownSignal) => {
    void shutdown(signal).then(
      () => {
        process.exit(0);
      },
      (error) => {
        server.log.error({ err: error, signal }, 'API shutdown failed');
        process.exit(1);
      }
    );
  };

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    server.log.info({ port: config.port }, 'API server started');
  } catch (error) {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    server.log.error({ err: error }, 'API server failed to start');
    process.exit(1);
  }
};

const isEntrypoint = (): boolean => {
  const entryArg = process.argv[1];
  if (entryArg === undefined) {
    return false;
  }

  return path.resolve(entryArg) === fileURLToPath(import.meta.url);
};

if (isEntrypoint()) {
  void start();
}
