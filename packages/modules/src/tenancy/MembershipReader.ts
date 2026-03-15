import type { MembershipClaim } from './domain/MembershipClaim';

/**
 * TEN-owned read port for membership lookups.
 *
 * Implementations must not mutate tenancy state.
 */
export interface MembershipReader {
  listMemberships(userId: string): Promise<MembershipClaim[]>;
  assertMembership(userId: string, tenantId: string): Promise<MembershipClaim>;
}
