import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { RequestLike } from './types';

export type TenantMembershipGuardClaim = {
  tenantId: string;
  role: string;
  status: string;
};

export type TenantMembershipGuardDeps = {
  getAuth: (request: RequestLike) => Promise<{ userId: string; sessionId?: string | undefined }>;
  assertMembership: (userId: string, tenantId: string) => Promise<TenantMembershipGuardClaim>;
};

const extractTenantId = (request: RequestLike): string | undefined => {
  const paramTenantId = request.params?.['tenantId'];
  if (typeof paramTenantId === 'string' && paramTenantId.length > 0) {
    return paramTenantId;
  }

  const snakeParamTenantId = request.params?.['tenant_id'];
  if (typeof snakeParamTenantId === 'string' && snakeParamTenantId.length > 0) {
    return snakeParamTenantId;
  }

  const headerTenantId = request.headers['x-tenant-id'];
  if (typeof headerTenantId === 'string' && headerTenantId.length > 0) {
    return headerTenantId;
  }

  return undefined;
};

export const requireTenantMembership = (deps: TenantMembershipGuardDeps) => {
  return async (request: RequestLike): Promise<void> => {
    const auth = await deps.getAuth(request);
    const tenantId = extractTenantId(request);

    request.auth = {
      ...(request.auth ?? {}),
      userId: auth.userId,
      sessionId: auth.sessionId
    };

    if (tenantId === undefined) {
      throw new AppError({
        code: ErrorCode.TenantResolutionFailed,
        message: 'Tenant resolution required'
      });
    }

    const claim = await deps.assertMembership(auth.userId, tenantId);
    request.tenant = {
      tenantId: claim.tenantId,
      role: claim.role
    };
  };
};
