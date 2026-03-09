import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { createTenancyRepository } from '@hypermarket/modules/tenancy';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('tenant isolation', () => {
  it('lists only tenants for a user', async () => {
    const context = await createTestContext();
    const repo = createTenancyRepository(context.db);

    const otherUserId = randomUUID();
    const otherTenantId = randomUUID();
    const otherMembershipId = randomUUID();

    await context.db
      .insertInto('tenants')
      .values({
        id: otherTenantId,
        name: 'Other Tenant',
        slug: `other-tenant-${otherTenantId.slice(0, 8)}`,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();

    await context.db
      .insertInto('tenant_memberships')
      .values({
        id: otherMembershipId,
        tenant_id: otherTenantId,
        user_id: otherUserId,
        role: 'owner',
        created_at: new Date()
      })
      .execute();

    const tenants = await repo.listTenantsForUser(context.seed.userId);
    const ids = tenants.map((t) => t.id);

    expect(ids).toContain(context.seed.tenantId);
    expect(ids).not.toContain(otherTenantId);

    await context.destroy();
  });
});
