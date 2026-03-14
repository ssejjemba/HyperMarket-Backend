import type { Kysely } from 'kysely';

import { ErrorCode } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';
import { createTenancyRepository } from '@hypermarket/modules/tenancy';

import { IaaError } from '../errors/IaaError';
import { MembershipClaim } from './MembershipClaim';
import type { MembershipReader } from './MembershipReader';

/**
 * Anti-corruption adapter that bridges the IAA module's `MembershipReader`
 * port to the Tenancy module's repository interface.
 *
 * Read-only: no mutations to tenancy data are performed here.
 */
export const createTenancyMembershipAdapter = (db: Kysely<DatabaseSchema>): MembershipReader => {
  const repo = createTenancyRepository(db);

  return {
    async listMemberships(userId: string): Promise<MembershipClaim[]> {
      const rows = await repo.getMembershipsForUser(userId);
      return rows.map(
        (r) =>
          new MembershipClaim({
            tenantId: r.tenantId,
            role: r.role,
            status: r.isActive ? 'active' : 'revoked'
          })
      );
    },

    async assertMembership(userId: string, tenantId: string): Promise<MembershipClaim> {
      const row = await repo.getMembership(userId, tenantId);

      if (row === null) {
        throw new IaaError({
          code: ErrorCode.AuthTenantMembershipMissing,
          message: 'User does not have membership in this tenant'
        });
      }

      if (!row.isActive) {
        throw new IaaError({
          code: ErrorCode.AuthTenantMembershipRevoked,
          message: 'User membership in this tenant has been revoked'
        });
      }

      return new MembershipClaim({ tenantId: row.tenantId, role: row.role, status: 'active' });
    }
  };
};
