import type { BaseLogger } from 'pino';
import type { Kysely } from 'kysely';

import type { AppConfigShape, DatabaseSchema, MetricsRegistry } from '@hypermarket/core';

export type ModuleDeps = {
  db: Kysely<DatabaseSchema>;
  logger: BaseLogger;
  config: AppConfigShape;
  metricsRegistry?: MetricsRegistry | undefined;
};

export type ModuleLogger = BaseLogger & {
  child: (bindings: Record<string, unknown>) => ModuleLogger;
};
