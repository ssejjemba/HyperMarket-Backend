import type { FastifyRequest } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { TemplateLogEvent } from '../../observability/TemplateLogEvent';

export const makeNotImplementedTemplateHandler =
  (logger: BaseLogger, event: TemplateLogEvent) =>
  async (request: FastifyRequest): Promise<never> => {
    logger.warn(
      {
        module: 'templates',
        event,
        request_id: request.id
      },
      'TMP route scaffold invoked before implementation'
    );

    throw new AppError({
      code: ErrorCode.NotImplemented,
      message: 'Template route not implemented'
    });
  };
