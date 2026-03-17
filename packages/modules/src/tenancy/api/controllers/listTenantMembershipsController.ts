import type { ListTenantMembershipsUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';

export type ListTenantMembershipsResponse = {
  memberships: Array<{
    user_id: string;
    role: 'owner' | 'manager' | 'staff';
    status: 'active' | 'revoked';
    created_at: string;
  }>;
};

export const makeListTenantMembershipsHandler =
  (useCase: ListTenantMembershipsUseCase) =>
  async (request: ModuleRequest): Promise<ListTenantMembershipsResponse> => {
    const tenantId = request.tenant?.tenantId;
    if (tenantId === undefined) {
      throw new Error('tenant context is required');
    }

    const memberships = await useCase.execute(tenantId);
    return {
      memberships: memberships.map((membership) => ({
        user_id: membership.userId,
        role: membership.role,
        status: membership.status,
        created_at: membership.createdAt.toISOString()
      }))
    };
  };
