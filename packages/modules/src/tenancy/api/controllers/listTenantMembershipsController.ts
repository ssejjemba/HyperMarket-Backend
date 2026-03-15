import type { FastifyRequest } from 'fastify';

import type { ListTenantMembershipsUseCase } from '../../application';

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
  async (request: FastifyRequest): Promise<ListTenantMembershipsResponse> => {
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
