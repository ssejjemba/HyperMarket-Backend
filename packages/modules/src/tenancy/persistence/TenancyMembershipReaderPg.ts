import { AppError, ErrorCode } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';
import type { Kysely } from 'kysely';

import type { MembershipReader } from '../MembershipReader';
import type { TenantMembership } from '../domain/Tenant';
import { mapMembership } from './mappers';
import { createTenantMembershipRepoPg } from './TenantMembershipRepoPg';

export const createMembershipReaderPg = (db: Kysely<DatabaseSchema>): MembershipReader => {
  const membershipRepo = createTenantMembershipRepoPg(db);

  return {
    async listMemberships(userId: string): Promise<TenantMembership[]> {
      return (await membershipRepo.listMemberships(userId)).map(mapMembership);
    },
    async assertMembership(userId: string, tenantId: string): Promise<TenantMembership> {
      const membership = await membershipRepo.findMembership(tenantId, userId);

      if (membership === null) {
        throw new AppError({
          code: ErrorCode.Forbidden,
          message: 'Tenant membership not found'
        });
      }

      if (membership.isActive === false) {
        throw new AppError({
          code: ErrorCode.Forbidden,
          message: 'Tenant membership is revoked'
        });
      }

      return mapMembership(membership);
    }
  };
};
