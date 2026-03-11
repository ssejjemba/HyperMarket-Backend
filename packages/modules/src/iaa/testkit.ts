import Fastify from 'fastify';
import pino from 'pino';

import { AppError, ErrorCode, errorToHttp } from '@hypermarket/contracts';

import type { ModuleDeps } from '../types';
import { registerIaaRoutes } from './index';

export const buildIaaTestServer = async () => {
  const server = Fastify({ logger: false });

  server.setErrorHandler(async (error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError({ code: ErrorCode.InternalError, message: 'Internal server error' });
    const { status, body } = errorToHttp(appError, request.id);
    await reply.status(status).send(body);
  });

  const fakeDeps = {
    db: null,
    logger: pino({ level: 'silent' }),
    config: null
  } as unknown as ModuleDeps;

  await registerIaaRoutes(server, fakeDeps);

  return server;
};
