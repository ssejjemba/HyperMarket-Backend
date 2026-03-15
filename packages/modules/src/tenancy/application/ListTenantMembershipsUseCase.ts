import type { TenantMembershipRepository } from '../persistence/TenantMembershipRepository';

export type TenantMembershipSummary = {
  userId: string;
  role: 'owner' | 'manager' | 'staff';
  status: 'active' | 'revoked';
  createdAt: Date;
};

export type ListTenantMembershipsUseCase = {
  execute(tenantId: string): Promise<TenantMembershipSummary[]>;
};

export type ListTenantMembershipsUseCaseDeps = {
  membershipRepo: TenantMembershipRepository;
};

export const createListTenantMembershipsUseCase = (
  deps: ListTenantMembershipsUseCaseDeps
): ListTenantMembershipsUseCase => {
  return {
    async execute(tenantId) {
      const memberships = await deps.membershipRepo.listTenantMemberships(tenantId);
      return memberships.map((membership) => ({
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt
      }));
    }
  };
};
