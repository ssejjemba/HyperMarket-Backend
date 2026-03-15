export type TenantMembershipRecord = {
  tenantId: string;
  userId: string;
  role: 'owner' | 'manager' | 'staff';
  status: 'active' | 'revoked';
  isActive: boolean;
  createdAt: Date;
};

export interface TenantMembershipRepository {
  createMembership(
    tenantId: string,
    userId: string,
    role: 'owner' | 'manager' | 'staff'
  ): Promise<TenantMembershipRecord>;
  findMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null>;
  listMemberships(userId: string): Promise<TenantMembershipRecord[]>;
  revokeMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null>;
}
