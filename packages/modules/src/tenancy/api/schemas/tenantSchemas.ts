import { z } from 'zod';

export const tenantIdParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID')
});

export const tenantMembershipRevokeSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID')
});
