import type { FastifyRequest } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { PublishingLogEvent } from '../../observability/PublishingLogEvent';

export const makeNotImplementedPublishingHandler =
  (logger: BaseLogger, event: PublishingLogEvent) =>
  async (request: FastifyRequest): Promise<never> => {
    logger.warn(
      {
        module: 'publishing',
        event,
        request_id: request.id
      },
      'PUB route scaffold invoked before implementation'
    );

    throw new AppError({
      code: ErrorCode.NotImplemented,
      message: 'Publishing route not implemented'
    });
  };
