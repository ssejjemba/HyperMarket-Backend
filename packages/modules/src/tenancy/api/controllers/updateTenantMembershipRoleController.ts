import type { UpdateTenantMembershipRoleUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';
import {
  parseTenantMembershipUserParams,
  parseUpdateTenantMembershipRoleInput
} from '../schemas/tenantSchemas';

export type UpdateTenantMembershipRoleResponse = {
  membership: {
    user_id: string;
    role: 'owner' | 'manager' | 'staff';
    status: 'active' | 'revoked';
    created_at: string;
    revoked_at: string | null;
  };
};

export const makeUpdateTenantMembershipRoleHandler =
  (useCase: UpdateTenantMembershipRoleUseCase) =>
  async (request: ModuleRequest): Promise<UpdateTenantMembershipRoleResponse> => {
    const actorUserId = request.auth?.userId;
    if (actorUserId === undefined) {
      throw new Error('auth context is required');
    }

    const { tenantId, userId } = parseTenantMembershipUserParams(request.params);
    const { role } = parseUpdateTenantMembershipRoleInput(request.body);
    const result = await useCase.execute({
      tenantId,
      actorUserId,
      targetUserId: userId,
      role,
      requestId: request.id
    });

    return {
      membership: {
        user_id: result.membership.userId,
        role: result.membership.role,
        status: result.membership.status,
        created_at: result.membership.createdAt.toISOString(),
        revoked_at: result.membership.revokedAt?.toISOString() ?? null
      }
    };
  };
