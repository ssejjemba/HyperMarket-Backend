import type { FastifyRequest } from 'fastify';

import type { GetTenantUseCase } from '../../application';

export type GetTenantResponse = {
  tenant: {
    id: string;
    business_name: string;
    slug: string;
    status: 'active' | 'suspended' | 'archived';
    primary_domain: string | null;
  };
};

export const makeGetTenantHandler =
  (useCase: GetTenantUseCase) =>
  async (request: FastifyRequest): Promise<GetTenantResponse> => {
    const tenantId = request.tenant?.tenantId;
    if (tenantId === undefined) {
      throw new Error('tenant context is required');
    }

    const tenant = await useCase.execute(tenantId);

    return {
      tenant: {
        id: tenant.id,
        business_name: tenant.businessName,
        slug: tenant.slug,
        status: tenant.status,
        primary_domain: tenant.primaryDomain
      }
    };
  };
