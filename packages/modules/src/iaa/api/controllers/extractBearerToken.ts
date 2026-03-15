import type { FastifyRequest } from 'fastify';

export const extractBearerToken = (request: FastifyRequest): string | undefined => {
  const authHeader = request.headers.authorization;

  return authHeader !== undefined && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
};
