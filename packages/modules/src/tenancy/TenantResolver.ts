import type { Tenant } from './domain/Tenant';

export type ResolvedTenant = {
  tenantId: string;
  tenant: Tenant;
};

export interface TenantResolutionCache {
  get(domain: string): Promise<ResolvedTenant | null>;
  set(domain: string, resolved: ResolvedTenant): Promise<void>;
}

export interface TenantResolver {
  resolveByDomain(domain: string): Promise<ResolvedTenant>;
}
