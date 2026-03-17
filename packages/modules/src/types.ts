import type { BaseLogger } from 'pino';
import type { Kysely } from 'kysely';
import type { FastifyRequest } from 'fastify';

import type { AppConfigShape, DatabaseSchema, MetricsRegistry } from '@hypermarket/core';
import type { RequestAuthState } from '@hypermarket/core/http';

export type ModuleDeps = {
  db: Kysely<DatabaseSchema>;
  logger: BaseLogger;
  config: AppConfigShape;
  metricsRegistry?: MetricsRegistry | undefined;
};

export type ModuleLogger = BaseLogger & {
  child: (bindings: Record<string, unknown>) => ModuleLogger;
};

export type ModuleRequest = FastifyRequest & RequestAuthState;
