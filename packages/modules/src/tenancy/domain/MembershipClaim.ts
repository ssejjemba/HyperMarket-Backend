export type MembershipStatus = 'active' | 'revoked';

export type MembershipClaim = {
  tenantId: string;
  role: 'owner' | 'manager' | 'staff';
  status: MembershipStatus;
};
