import type { RevokeTenantMembershipUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';
import { parseTenantMembershipUserParams } from '../schemas/tenantSchemas';

export type RevokeTenantMembershipResponse = {
  changed: boolean;
  membership: {
    user_id: string;
    role: 'owner' | 'manager' | 'staff';
    status: 'active' | 'revoked';
    created_at: string;
    revoked_at: string | null;
  };
};

export const makeRevokeTenantMembershipHandler =
  (useCase: RevokeTenantMembershipUseCase) =>
  async (request: ModuleRequest): Promise<RevokeTenantMembershipResponse> => {
    const actorUserId = request.auth?.userId;
    if (actorUserId === undefined) {
      throw new Error('auth context is required');
    }

    const { tenantId, userId } = parseTenantMembershipUserParams(request.params);
    const result = await useCase.execute({
      tenantId,
      actorUserId,
      targetUserId: userId,
      requestId: request.id
    });

    return {
      changed: result.changed,
      membership: {
        user_id: result.membership.userId,
        role: result.membership.role,
        status: result.membership.status,
        created_at: result.membership.createdAt.toISOString(),
        revoked_at: result.membership.revokedAt?.toISOString() ?? null
      }
    };
  };
