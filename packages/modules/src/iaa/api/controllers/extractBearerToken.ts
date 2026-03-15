import type { FastifyRequest } from 'fastify';

type AuthHeaderRequest = Pick<FastifyRequest, 'headers'>;

export const extractBearerToken = (request: AuthHeaderRequest): string | undefined => {
  const authHeader = request.headers.authorization;

  return authHeader !== undefined && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
};
