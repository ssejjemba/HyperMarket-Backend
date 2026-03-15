import type { FastifyRequest } from 'fastify';

import { extractBearerToken } from '../../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../../iaa/session/SessionService';
import type { ListTenantsUseCase } from '../../application';

type TenantListItemResponse = {
  id: string;
  business_name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  primary_domain: string | null;
};

export type ListTenantsResponse = {
  tenants: TenantListItemResponse[];
};

export const makeListTenantsHandler =
  (useCase: ListTenantsUseCase, sessionService: SessionService) =>
  async (request: FastifyRequest): Promise<ListTenantsResponse> => {
    const { userId } = await sessionService.validateSession(extractBearerToken(request));
    const tenants = await useCase.execute(userId);

    return {
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        business_name: tenant.businessName,
        slug: tenant.slug,
        status: tenant.status,
        primary_domain: tenant.primaryDomain
      }))
    };
  };
