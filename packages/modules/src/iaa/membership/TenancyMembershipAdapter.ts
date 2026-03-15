import type { Kysely } from 'kysely';

import { ErrorCode } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';
import { TenancyError, createMembershipReaderPg } from '@hypermarket/modules/tenancy';

import { IaaError } from '../errors/IaaError';
import { MembershipClaim } from './MembershipClaim';
import type { MembershipReader } from './MembershipReader';

/**
 * Anti-corruption adapter that bridges the IAA module's `MembershipReader`
 * port to the Tenancy module's public membership reader interface.
 *
 * Read-only: no mutations to tenancy data are performed here.
 */
export const createTenancyMembershipAdapter = (db: Kysely<DatabaseSchema>): MembershipReader => {
  const reader = createMembershipReaderPg(db);

  return {
    async listMemberships(userId: string): Promise<MembershipClaim[]> {
      const rows = await reader.listMemberships(userId);
      return rows.map(
        (r) =>
          new MembershipClaim({
            tenantId: r.tenantId,
            role: r.role,
            status: r.status
          })
      );
    },

    async assertMembership(userId: string, tenantId: string): Promise<MembershipClaim> {
      try {
        const row = await reader.assertMembership(userId, tenantId);
        return new MembershipClaim({ tenantId: row.tenantId, role: row.role, status: 'active' });
      } catch (error) {
        if (error instanceof TenancyError) {
          if (error.code === ErrorCode.TenantMembershipNotFound) {
            throw new IaaError({
              code: ErrorCode.AuthTenantMembershipMissing,
              message: 'User does not have membership in this tenant'
            });
          }

          if (error.code === ErrorCode.TenantMembershipRevoked) {
            throw new IaaError({
              code: ErrorCode.AuthTenantMembershipRevoked,
              message: 'User membership in this tenant has been revoked'
            });
          }
        }

        throw error;
      }
    }
  };
};
