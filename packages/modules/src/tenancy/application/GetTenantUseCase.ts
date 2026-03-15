import { ErrorCode } from '@hypermarket/contracts';

import { TenancyError } from '../errors/TenancyError';
import type { TenantDomainRepository } from '../persistence/TenantDomainRepository';
import type { TenantRepository } from '../persistence/TenantRepository';
import type { TenantSummary } from './ListTenantsUseCase';

export type GetTenantUseCase = {
  execute(tenantId: string): Promise<TenantSummary>;
};

export type GetTenantUseCaseDeps = {
  tenantRepo: TenantRepository;
  domainRepo: TenantDomainRepository;
};

export const createGetTenantUseCase = (deps: GetTenantUseCaseDeps): GetTenantUseCase => {
  return {
    async execute(tenantId) {
      const tenant = await deps.tenantRepo.findById(tenantId);
      if (tenant === null) {
        throw new TenancyError({
          code: ErrorCode.TenantNotFound,
          message: 'Tenant not found'
        });
      }

      const domains = await deps.domainRepo.listDomains(tenantId);
      const primary = domains.find((item) => item.isPrimary) ?? domains[0];

      return {
        id: tenant.id,
        businessName: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        primaryDomain: primary?.domain ?? null
      };
    }
  };
};
