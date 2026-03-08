import type { RequestContext } from '@hypermarket/core';

declare module 'fastify' {
  interface FastifyRequest {
    requestContext?: RequestContext;
  }
}
