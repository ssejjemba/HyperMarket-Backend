import type { ResolvedTenant, TenantResolutionCache } from '../TenantResolver';

export const createNoopTenantResolutionCache = (): TenantResolutionCache => ({
  async get(_domain: string): Promise<ResolvedTenant | null> {
    return null;
  },
  async set(_domain: string, _resolved: ResolvedTenant): Promise<void> {}
});
