import type { FastifyRequest } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { TenancyLogEvent } from '../../observability/TenancyLogEvent';

export const makeNotImplementedTenantHandler =
  (logger: BaseLogger, event: TenancyLogEvent) =>
  async (request: FastifyRequest): Promise<never> => {
    logger.warn(
      {
        module: 'tenancy',
        event,
        request_id: request.id
      },
      'TEN route scaffold invoked before implementation'
    );

    throw new AppError({
      code: ErrorCode.NotImplemented,
      message: 'Tenancy route not implemented'
    });
  };
