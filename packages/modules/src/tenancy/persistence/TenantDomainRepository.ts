export type CreateDomainMappingInput = {
  tenantId: string;
  domain: string;
  type: 'subdomain' | 'custom';
  status: 'verified' | 'pending' | 'failed';
  isPrimary: boolean;
};

export type TenantDomain = {
  id: string;
  tenantId: string;
  domain: string;
  type: 'subdomain' | 'custom';
  verificationStatus: 'verified' | 'pending' | 'failed';
  isPrimary: boolean;
  createdAt: Date;
};

export interface TenantDomainRepository {
  createDomainMapping(input: CreateDomainMappingInput): Promise<TenantDomain>;
  findTenantIdByDomain(domain: string): Promise<string | null>;
  listDomains(tenantId: string): Promise<TenantDomain[]>;
}
