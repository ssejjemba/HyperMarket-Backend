import pino, { type Logger, type LoggerOptions } from 'pino';

import type { AppConfig } from '../config/loadEnv';
import type { RequestContext } from './requestContext';

type ChildLogger<T = unknown> = {
  child: (bindings: Record<string, unknown>) => T;
};

type CreateLoggerOptions = {
  config: AppConfig;
  base?: LoggerOptions['base'];
};

export const createLogger = ({ config, base }: CreateLoggerOptions): Logger => {
  const options: LoggerOptions = {
    level: config.logLevel,
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime
  };

  if (base !== undefined) {
    options.base = base;
  }

  return pino(options);
};

export const withRequestContext = <T extends ChildLogger>(
  logger: T,
  context: RequestContext
): T => {
  return logger.child({
    requestId: context.requestId,
    traceId: context.traceId,
    userId: context.userId,
    tenantId: context.tenantId
  }) as T;
};
