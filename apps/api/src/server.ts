import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import Fastify from 'fastify';

import { loadEnv, type AppConfig } from '@hypermarket/core/config/loadEnv';
import { createLogger, withRequestContext } from '@hypermarket/core/observability/logger';
import type { RequestContext } from '@hypermarket/core/observability/requestContext';
import { AppError, ErrorCode, errorToHttp } from '@hypermarket/contracts';

type ServerOptions = {
  config: AppConfig;
};

const createRequestContext = (requestId: string, traceId: string): RequestContext => {
  return {
    requestId,
    traceId
  };
};

export const buildServer = ({ config }: ServerOptions) => {
  const logger = createLogger({ config, base: { service: 'api' } });

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

  app.addHook('onRequest', async (request, reply) => {
    const traceHeader = request.headers['x-trace-id'];
    const traceId =
      typeof traceHeader === 'string' && traceHeader.length > 0 ? traceHeader : request.id;
    const requestContext = createRequestContext(request.id, traceId);

    request.requestContext = requestContext;
    request.log = withRequestContext(request.log, requestContext);
    reply.header('x-request-id', request.id);
  });

  app.get('/health', async (request) => {
    return {
      status: 'ok',
      request_id: request.id
    };
  });

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

  return app;
};

const resolveRootDir = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../..');
};

const loadConfig = (): AppConfig => {
  const rootDir = resolveRootDir();
  loadDotenv({ path: path.join(rootDir, '.env') });

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

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    server.log.info({ port: config.port }, 'API server started');
  } catch (error) {
    server.log.error({ err: error }, 'API server failed to start');
    process.exit(1);
  }
};

void start();
