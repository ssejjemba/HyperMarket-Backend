import type { MembershipClaim } from './MembershipClaim';

/**
 * Read-only port for querying a user's tenant memberships.
 *
 * Implementations must never mutate tenancy data.
 */
export interface MembershipReader {
  /** Return all memberships (active and revoked) for the given user. */
  listMemberships(userId: string): Promise<MembershipClaim[]>;

  /**
   * Assert the user holds an active membership in the tenant.
   * Throws AUTH_TENANT_MEMBERSHIP_MISSING when no row exists.
   * Throws AUTH_TENANT_MEMBERSHIP_REVOKED when the row is inactive.
   */
  assertMembership(userId: string, tenantId: string): Promise<MembershipClaim>;
}
