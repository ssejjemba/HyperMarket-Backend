import { z } from 'zod';

export const createTenantRequestSchema = z.object({
  business_name: z.string().min(1, 'business_name is required').max(255),
  slug: z.string().min(1).max(63).optional()
});

export const tenantIdParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID')
});

export const tenantMembershipRevokeSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID')
});
