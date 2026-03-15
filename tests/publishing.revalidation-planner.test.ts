import { describe, expect, it } from 'vitest';

import { createRevalidationPlanner } from '@hypermarket/modules/publishing';

describe('publishing revalidation planner', () => {
  it('returns deterministic tenant root targets', () => {
    const planner = createRevalidationPlanner();

    expect(planner.planForTenant('tenant-1')).toEqual({
      targets: ['/', '/sitemap.xml', '/robots.txt']
    });
  });

  it('returns the same targets for different tenants', () => {
    const planner = createRevalidationPlanner();

    expect(planner.planForTenant('tenant-a').targets).toEqual(
      planner.planForTenant('tenant-b').targets
    );
  });
});
