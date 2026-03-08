import pino, { type Logger, type LoggerOptions } from 'pino';

import type { AppConfig } from '../config/loadEnv';
import type { RequestContext } from './requestContext';

type CreateLoggerOptions = {
  config: AppConfig;
  base?: LoggerOptions['base'];
};

export const createLogger = ({ config, base }: CreateLoggerOptions): Logger => {
  return pino({
    level: config.logLevel,
    base,
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime
  });
};

export const withRequestContext = (logger: Logger, context: RequestContext): Logger => {
  return logger.child({
    requestId: context.requestId,
    traceId: context.traceId,
    userId: context.userId,
    tenantId: context.tenantId
  });
};
