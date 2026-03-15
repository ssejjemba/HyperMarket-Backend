import type { FastifyRequest } from 'fastify';

import type { LogoutUseCase } from '../../session/application/LogoutUseCase';
import { extractBearerToken } from './extractBearerToken';

export type LogoutResponse = {
  success: true;
};

export const makeLogoutHandler =
  (useCase: LogoutUseCase) =>
  async (request: FastifyRequest): Promise<LogoutResponse> => {
    await useCase.execute({
      token: extractBearerToken(request),
      requestId: request.id
    });

    return { success: true };
  };
