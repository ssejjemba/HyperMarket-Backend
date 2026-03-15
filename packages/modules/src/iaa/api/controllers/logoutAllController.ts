import type { FastifyRequest } from 'fastify';

import type { LogoutAllUseCase } from '../../session/application/LogoutAllUseCase';
import { extractBearerToken } from './extractBearerToken';

export type LogoutAllResponse = {
  success: true;
};

export const makeLogoutAllHandler =
  (useCase: LogoutAllUseCase) =>
  async (request: FastifyRequest): Promise<LogoutAllResponse> => {
    await useCase.execute({
      token: extractBearerToken(request),
      requestId: request.id
    });

    return { success: true };
  };
