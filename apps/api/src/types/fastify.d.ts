import type { RequestContext } from '@hypermarket/core';
import type { AuthContext, TenantContext } from '@hypermarket/core/http';

declare module 'fastify' {
  interface FastifyRequest {
    requestContext?: RequestContext;
    auth?: AuthContext;
    tenant?: TenantContext;
  }
}
