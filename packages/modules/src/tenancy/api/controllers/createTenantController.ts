import type { FastifyRequest } from 'fastify';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import { extractBearerToken } from '../../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../../iaa/session/SessionService';
import type { CreateTenantUseCase } from '../../application';
import { createTenantRequestSchema } from '../schemas/tenantSchemas';

export type CreateTenantResponse = {
  tenant: {
    id: string;
    business_name: string;
    slug: string;
    status: string;
  };
  primary_domain: string;
};

export const makeCreateTenantHandler =
  (useCase: CreateTenantUseCase, sessionService: SessionService) =>
  async (request: FastifyRequest): Promise<CreateTenantResponse> => {
    const parsed = createTenantRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        code: ErrorCode.ValidationFailed,
        message: parsed.error.errors[0]?.message ?? 'Invalid request body'
      });
    }

    const { userId } = await sessionService.validateSession(extractBearerToken(request));
    const result = await useCase.execute({
      businessName: parsed.data.business_name,
      slug: parsed.data.slug,
      ownerUserId: userId,
      requestId: request.id
    });

    return {
      tenant: {
        id: result.tenant.id,
        business_name: result.tenant.businessName,
        slug: result.tenant.slug,
        status: result.tenant.status
      },
      primary_domain: result.primaryDomain
    };
  };
