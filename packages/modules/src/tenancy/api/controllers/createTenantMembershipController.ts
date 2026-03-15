import type { FastifyRequest } from 'fastify';

import type { CreateTenantMembershipUseCase } from '../../application';
import { parseCreateTenantMembershipInput } from '../schemas/tenantSchemas';

export type CreateTenantMembershipResponse = {
  membership: {
    user_id: string;
    role: 'owner' | 'manager' | 'staff';
    status: 'active' | 'revoked';
    created_at: string;
  };
};

export const makeCreateTenantMembershipHandler =
  (useCase: CreateTenantMembershipUseCase) =>
  async (request: FastifyRequest): Promise<CreateTenantMembershipResponse> => {
    const tenantId = request.tenant?.tenantId;
    const actorUserId = request.auth?.userId;
    if (tenantId === undefined || actorUserId === undefined) {
      throw new Error('auth and tenant context are required');
    }

    const input = parseCreateTenantMembershipInput(request.body);
    const result = await useCase.execute({
      tenantId,
      actorUserId,
      phoneE164: input.phoneE164,
      role: input.role,
      requestId: request.id
    });

    return {
      membership: {
        user_id: result.membership.userId,
        role: result.membership.role,
        status: result.membership.status,
        created_at: result.membership.createdAt.toISOString()
      }
    };
  };
