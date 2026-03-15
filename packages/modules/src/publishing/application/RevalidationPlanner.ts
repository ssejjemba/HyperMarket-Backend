export type RevalidationPlan = {
  targets: string[];
};

export type RevalidationPlanner = {
  planForTenant(tenantId: string): RevalidationPlan;
};

const DEFAULT_TARGETS = ['/', '/sitemap.xml', '/robots.txt'] as const;

export const createRevalidationPlanner = (): RevalidationPlanner => ({
  planForTenant() {
    return {
      targets: [...DEFAULT_TARGETS]
    };
  }
});
