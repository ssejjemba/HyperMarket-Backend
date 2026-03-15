import { AppError, ErrorCode } from '@hypermarket/contracts';
import type { DatabaseSchema } from '@hypermarket/core';
import type { Kysely } from 'kysely';

import type { MembershipReader } from '../MembershipReader';
import type { TenantMembership } from '../domain/Tenant';
import { createTenancyRepository } from './TenancyRepoPg';

export const createMembershipReaderPg = (db: Kysely<DatabaseSchema>): MembershipReader => {
  const repo = createTenancyRepository(db);

  return {
    listMemberships(userId: string): Promise<TenantMembership[]> {
      return repo.getMembershipsForUser(userId);
    },
    async assertMembership(userId: string, tenantId: string): Promise<TenantMembership> {
      const membership = await repo.getMembership(userId, tenantId);

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

      return membership;
    }
  };
};
