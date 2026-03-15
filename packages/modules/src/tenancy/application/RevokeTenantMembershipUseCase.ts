import type { Kysely } from 'kysely';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';

import { TenancyError } from '../errors/TenancyError';
import type { TenantMembershipRecord } from '../persistence/TenantMembershipRepository';
import { createTenantMembershipRepoPg } from '../persistence/TenantMembershipRepoPg';
import { toAuditRequestId } from './auditRequestId';

export type RevokeTenantMembershipInput = {
  tenantId: string;
  actorUserId: string;
  targetUserId: string;
  requestId?: string | undefined;
};

export type RevokeTenantMembershipOutput = {
  changed: boolean;
  membership: {
    userId: string;
    role: 'owner' | 'manager' | 'staff';
    status: 'active' | 'revoked';
    createdAt: Date;
    revokedAt: Date | null;
  };
};

export type RevokeTenantMembershipUseCase = {
  execute(input: RevokeTenantMembershipInput): Promise<RevokeTenantMembershipOutput>;
};

export type RevokeTenantMembershipUseCaseDeps = {
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

export const createRevokeTenantMembershipUseCase = (
  deps: RevokeTenantMembershipUseCaseDeps
): RevokeTenantMembershipUseCase => {
  const auditWriter = createAuditWriter();

  return {
    async execute(input) {
      return runInTransaction(deps.db, async (trx) => {
        const membershipRepo = createTenantMembershipRepoPg(trx);
        const before = await membershipRepo.getMembership(input.tenantId, input.targetUserId);

        if (before === null) {
          throw new TenancyError({
            code: ErrorCode.TenantMembershipNotFound,
            message: 'Tenant membership not found'
          });
        }

        if (before.status === 'revoked') {
          return {
            changed: false,
            membership: {
              userId: before.userId,
              role: before.role,
              status: before.status,
              createdAt: before.createdAt,
              revokedAt: before.revokedAt
            }
          };
        }

        if (before.role === 'owner') {
          const activeOwners = await membershipRepo.listActiveOwners(input.tenantId);
          if (activeOwners.length <= 1) {
            throw new TenancyError({
              code: ErrorCode.TenantLastOwnerRevokeForbidden,
              message: 'Cannot revoke the last active tenant owner'
            });
          }
        }

        const after = await membershipRepo.revokeMembership(
          input.tenantId,
          input.targetUserId,
          input.actorUserId
        );

        if (after === null) {
          throw new TenancyError({
            code: ErrorCode.TenantMembershipNotFound,
            message: 'Tenant membership not found'
          });
        }

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'tenant.membership.revoked',
          targetType: 'tenant_membership',
          targetId: `${input.tenantId}:${input.targetUserId}`,
          before: toMembershipPayload(before),
          after: toMembershipPayload(after),
          requestId: toAuditRequestId(input.requestId)
        });

        return {
          changed: true,
          membership: {
            userId: after.userId,
            role: after.role,
            status: after.status,
            createdAt: after.createdAt,
            revokedAt: after.revokedAt
          }
        };
      });
    }
  };
};
