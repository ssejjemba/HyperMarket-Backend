import type { TenantDomainRepository } from '../persistence/TenantDomainRepository';
import type { TenantRepository } from '../persistence/TenantRepository';

export type TenantSummary = {
  id: string;
  businessName: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  primaryDomain: string | null;
};

export type ListTenantsUseCase = {
  execute(userId: string): Promise<TenantSummary[]>;
};

export type ListTenantsUseCaseDeps = {
  tenantRepo: TenantRepository;
  domainRepo: TenantDomainRepository;
};

const pickPrimaryDomain = async (
  domainRepo: TenantDomainRepository,
  tenantId: string
): Promise<string | null> => {
  const domains = await domainRepo.listDomains(tenantId);
  const primary = domains.find((item) => item.isPrimary) ?? domains[0];
  return primary?.domain ?? null;
};

export const createListTenantsUseCase = (deps: ListTenantsUseCaseDeps): ListTenantsUseCase => {
  return {
    async execute(userId) {
      const tenants = await deps.tenantRepo.listForUser(userId);

      return Promise.all(
        tenants.map(async (tenant) => ({
          id: tenant.id,
          businessName: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          primaryDomain: await pickPrimaryDomain(deps.domainRepo, tenant.id)
        }))
      );
    }
  };
};
