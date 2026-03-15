import type { Kysely } from 'kysely';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';

import { PhoneNumber } from '../../iaa/phone/PhoneNumber';
import { createUserRepoPg } from '../../iaa/user/persistence/UserRepoPg';
import { createUserService } from '../../iaa/user/UserService';
import { TenancyError } from '../errors/TenancyError';
import type { TenantMembershipRecord } from '../persistence/TenantMembershipRepository';
import { createTenantMembershipRepoPg } from '../persistence/TenantMembershipRepoPg';
import { toAuditRequestId } from './auditRequestId';

export type CreateTenantMembershipInput = {
  tenantId: string;
  actorUserId: string;
  phoneE164: string;
  role: 'owner' | 'manager' | 'staff';
  requestId?: string | undefined;
};

export type CreateTenantMembershipOutput = {
  membership: {
    userId: string;
    role: 'owner' | 'manager' | 'staff';
    status: 'active' | 'revoked';
    createdAt: Date;
  };
};

export type CreateTenantMembershipUseCase = {
  execute(input: CreateTenantMembershipInput): Promise<CreateTenantMembershipOutput>;
};

export type CreateTenantMembershipUseCaseDeps = {
  db: Kysely<DatabaseSchema>;
};

const toMembershipPayload = (membership: TenantMembershipRecord): Record<string, unknown> => ({
  tenant_id: membership.tenantId,
  user_id: membership.userId,
  role: membership.role,
  status: membership.status,
  created_at: membership.createdAt.toISOString(),
  revoked_at: membership.revokedAt?.toISOString() ?? null
});

export const createCreateTenantMembershipUseCase = (
  deps: CreateTenantMembershipUseCaseDeps
): CreateTenantMembershipUseCase => {
  const auditWriter = createAuditWriter();

  return {
    async execute(input) {
      return runInTransaction(deps.db, async (trx) => {
        const membershipRepo = createTenantMembershipRepoPg(trx);
        const userService = createUserService({ repo: createUserRepoPg(trx) });
        const targetUser = await userService.getOrCreateByPhone(PhoneNumber.parse(input.phoneE164));

        const existingMembership = await membershipRepo.getMembership(
          input.tenantId,
          targetUser.id
        );
        if (existingMembership !== null) {
          throw new TenancyError({
            code: ErrorCode.TenantMembershipExists,
            message: 'Tenant membership already exists'
          });
        }

        const membership = await membershipRepo.createMembership(
          input.tenantId,
          targetUser.id,
          input.role
        );

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'tenant.membership.created',
          targetType: 'tenant_membership',
          targetId: `${input.tenantId}:${targetUser.id}`,
          after: {
            ...toMembershipPayload(membership),
            phone_e164: targetUser.phoneE164
          },
          requestId: toAuditRequestId(input.requestId)
        });

        return {
          membership: {
            userId: membership.userId,
            role: membership.role,
            status: membership.status,
            createdAt: membership.createdAt
          }
        };
      });
    }
  };
};
