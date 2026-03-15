import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import {
  TenancyError,
  createMembershipReaderPg,
  type MembershipReader
} from '@hypermarket/modules/tenancy';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('TEN MembershipReader - integration', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let reader: MembershipReader;

  beforeEach(async () => {
    ctx = await createTestContext();
    reader = createMembershipReaderPg(ctx.db);
  });

  afterEach(async () => {
    await ctx.destroy();
  });

  it('listMemberships returns membership claims for the user', async () => {
    const claims = await reader.listMemberships(ctx.seed.userId);

    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: ctx.seed.tenantId,
          role: 'owner',
          status: 'active'
        })
      ])
    );
  });

  it('assertMembership throws tenant_membership_revoked for revoked memberships', async () => {
    await ctx.db
      .updateTable('tenant_memberships')
      .set({ status: 'revoked' })
      .where('tenant_id', '=', ctx.seed.tenantId)
      .where('user_id', '=', ctx.seed.userId)
      .execute();

    let thrown: unknown;
    try {
      await reader.assertMembership(ctx.seed.userId, ctx.seed.tenantId);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TenancyError);
    expect((thrown as TenancyError).code).toBe(ErrorCode.TenantMembershipRevoked);
  });
});
