import { AppError, ErrorCode } from '@hypermarket/contracts';

import { requireTenantMembership, type TenantMembershipGuardDeps } from './requireTenantMembership';
import type { RequestLike } from './types';

export const requireTenantOwner = (deps: TenantMembershipGuardDeps) => {
  const membershipGuard = requireTenantMembership(deps);

  return async (request: RequestLike): Promise<void> => {
    await membershipGuard(request);

    if (request.tenant?.role !== 'owner' || request.tenant?.status !== 'active') {
      throw new AppError({
        code: ErrorCode.TenantAccessForbidden,
        message: 'Tenant owner access required'
      });
    }
  };
};
