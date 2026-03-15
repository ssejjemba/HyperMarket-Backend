export type TenantMembershipRecord = {
  tenantId: string;
  userId: string;
  role: 'owner' | 'manager' | 'staff';
  status: 'active' | 'revoked';
  isActive: boolean;
  createdAt: Date;
  revokedAt: Date | null;
};

export interface TenantMembershipRepository {
  createMembership(
    tenantId: string,
    userId: string,
    role: 'owner' | 'manager' | 'staff'
  ): Promise<TenantMembershipRecord>;
  getMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null>;
  listMemberships(userId: string): Promise<TenantMembershipRecord[]>;
  listActiveOwners(tenantId: string): Promise<TenantMembershipRecord[]>;
  updateRole(
    tenantId: string,
    userId: string,
    role: 'owner' | 'manager' | 'staff'
  ): Promise<TenantMembershipRecord | null>;
  revokeMembership(
    tenantId: string,
    userId: string,
    actorUserId: string
  ): Promise<TenantMembershipRecord | null>;
}
