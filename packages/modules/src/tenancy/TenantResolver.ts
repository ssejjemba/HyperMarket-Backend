export interface TenantResolver {
  resolveTenantIdByDomain(domain: string): Promise<string | null>;
}
