export type CatalogRevalidationPlan = {
  targets: string[];
};

export type CatalogRevalidationPlanner = {
  planForTenant(tenantId: string): CatalogRevalidationPlan;
  planForProduct(input: { tenantId: string; productSlug: string }): CatalogRevalidationPlan;
  planForCategory(input: { tenantId: string; categorySlug: string }): CatalogRevalidationPlan;
};

const tenantWideTargets = ['/', '/products', '/categories', '/sitemap.xml', '/robots.txt'] as const;

export const createCatalogRevalidationPlanner = (): CatalogRevalidationPlanner => ({
  planForTenant() {
    return {
      targets: [...tenantWideTargets]
    };
  },
  planForProduct({ productSlug }) {
    return {
      targets: [...tenantWideTargets, `/products/${productSlug}`]
    };
  },
  planForCategory({ categorySlug }) {
    return {
      targets: [...tenantWideTargets, `/category/${categorySlug}`]
    };
  }
});
