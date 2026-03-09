import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { RequestLike, RouteAccess } from './types';

const requiresTenant = (access: RouteAccess): boolean => access === 'auth+tenant';

const extractTenantId = (headers: RequestLike['headers']): string | undefined => {
  const header = headers['x-tenant-id'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }

  return undefined;
};

export const tenantMiddleware = (access: RouteAccess = 'public') => {
  return async (request: RequestLike): Promise<void> => {
    const tenantId = extractTenantId(request.headers);

    request.tenant = tenantId === undefined ? undefined : { tenantId };

    if (requiresTenant(access) && request.tenant?.tenantId === undefined) {
      throw new AppError({
        code: ErrorCode.TenantResolutionFailed,
        message: 'Tenant resolution required'
      });
    }
  };
};
