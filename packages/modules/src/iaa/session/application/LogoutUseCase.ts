import type { Kysely } from 'kysely';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';

import type { MembershipReader } from '../../membership/MembershipReader';
import type { SessionService } from '../SessionService';
import { createSessionRepoPg } from '../persistence/SessionRepoPg';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toAuditTenantIds = async (
  membershipReader: MembershipReader,
  userId: string
): Promise<string[]> => {
  const memberships = await membershipReader.listMemberships(userId);
  const tenantIds = [...new Set(memberships.map((membership) => membership.tenantId))];

  return tenantIds.length > 0 ? tenantIds : [SYSTEM_TENANT_ID];
};

const toAuditRequestId = (requestId: string): string | undefined => {
  return UUID_PATTERN.test(requestId) ? requestId : undefined;
};

export type LogoutInput = {
  token: string | undefined | null;
  requestId: string;
};

export type LogoutUseCase = {
  execute(input: LogoutInput): Promise<void>;
};

export type LogoutUseCaseDeps = {
  db: Kysely<DatabaseSchema>;
  sessionService: SessionService;
  membershipReader: MembershipReader;
};

export const createLogoutUseCase = (deps: LogoutUseCaseDeps): LogoutUseCase => {
  const auditWriter = createAuditWriter();

  return {
    async execute(input: LogoutInput): Promise<void> {
      const { userId, sessionId } = await deps.sessionService.validateSession(input.token);
      const tenantIds = await toAuditTenantIds(deps.membershipReader, userId);

      await runInTransaction(deps.db, async (trx) => {
        const sessionRepo = createSessionRepoPg(trx);
        await sessionRepo.revokeSession(sessionId);

        for (const tenantId of tenantIds) {
          await auditWriter.write(trx, {
            tenantId,
            actorUserId: userId,
            action: 'auth.session.revoked',
            targetType: 'auth_session',
            targetId: sessionId,
            after: { revoked: true },
            requestId: toAuditRequestId(input.requestId)
          });
        }
      });
    }
  };
};
