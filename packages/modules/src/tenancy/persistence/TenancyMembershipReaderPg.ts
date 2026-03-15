import { ErrorCode } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';
import type { Kysely } from 'kysely';

import type { MembershipReader } from '../MembershipReader';
import type { MembershipClaim } from '../domain/MembershipClaim';
import { TenancyError } from '../errors/TenancyError';
import { mapMembershipClaim } from './mappers';
import { createTenantMembershipRepoPg } from './TenantMembershipRepoPg';

export const createMembershipReaderPg = (db: Kysely<DatabaseSchema>): MembershipReader => {
  const membershipRepo = createTenantMembershipRepoPg(db);

  return {
    async listMemberships(userId: string): Promise<MembershipClaim[]> {
      return (await membershipRepo.listMemberships(userId)).map(mapMembershipClaim);
    },
    async assertMembership(userId: string, tenantId: string): Promise<MembershipClaim> {
      const membership = await membershipRepo.getMembership(tenantId, userId);

      if (membership === null) {
        throw new TenancyError({
          code: ErrorCode.TenantMembershipNotFound,
          message: 'Tenant membership not found'
        });
      }

      if (membership.isActive === false) {
        throw new TenancyError({
          code: ErrorCode.TenantMembershipRevoked,
          message: 'Tenant membership is revoked'
        });
      }

      return mapMembershipClaim(membership);
    }
  };
};
