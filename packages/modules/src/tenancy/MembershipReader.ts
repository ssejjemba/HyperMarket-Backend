import type { TenantMembership } from './domain/Tenant';

/**
 * TEN-owned read port for membership lookups.
 *
 * Implementations must not mutate tenancy state.
 */
export interface MembershipReader {
  listMemberships(userId: string): Promise<TenantMembership[]>;
  assertMembership(userId: string, tenantId: string): Promise<TenantMembership>;
}
