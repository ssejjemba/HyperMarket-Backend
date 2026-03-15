import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import {
  IaaError,
  MembershipClaim,
  createTenancyMembershipAdapter
} from '@hypermarket/modules/iaa';
import type { MembershipReader } from '@hypermarket/modules/iaa';

// ---------------------------------------------------------------------------
// Suite guard
// ---------------------------------------------------------------------------

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('TenancyMembershipAdapter — integration', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let adapter: MembershipReader;

  beforeEach(async () => {
    ctx = await createTestContext();
    adapter = createTenancyMembershipAdapter(ctx.db);
  });

  afterEach(async () => {
    await ctx.destroy();
  });

  // -------------------------------------------------------------------------
  // listMemberships
  // -------------------------------------------------------------------------

  it('returns MembershipClaim for the seeded user', async () => {
    const claims = await adapter.listMemberships(ctx.seed.userId);

    expect(claims.length).toBeGreaterThanOrEqual(1);
    const claim = claims.find((c) => c.tenantId === ctx.seed.tenantId);
    expect(claim).toBeDefined();
    expect(claim).toBeInstanceOf(MembershipClaim);
    expect(claim!.role).toBe('owner');
    expect(claim!.status).toBe('active');
    expect(claim!.isActive).toBe(true);
  });

  it('returns empty array when user has no memberships', async () => {
    const claims = await adapter.listMemberships('00000000-0000-0000-0000-000000000000');
    expect(claims).toEqual([]);
  });

  it('includes revoked memberships in the list with status "revoked"', async () => {
    // Revoke the seeded membership
    await ctx.db
      .updateTable('tenant_memberships')
      .set({ status: 'revoked' })
      .where('user_id', '=', ctx.seed.userId)
      .where('tenant_id', '=', ctx.seed.tenantId)
      .execute();

    const claims = await adapter.listMemberships(ctx.seed.userId);
    const claim = claims.find((c) => c.tenantId === ctx.seed.tenantId);

    expect(claim).toBeDefined();
    expect(claim!.status).toBe('revoked');
    expect(claim!.isActive).toBe(false);
  });

  // -------------------------------------------------------------------------
  // assertMembership — success
  // -------------------------------------------------------------------------

  it('assertMembership returns the active membership claim', async () => {
    const claim = await adapter.assertMembership(ctx.seed.userId, ctx.seed.tenantId);

    expect(claim).toBeInstanceOf(MembershipClaim);
    expect(claim.tenantId).toBe(ctx.seed.tenantId);
    expect(claim.role).toBe('owner');
    expect(claim.status).toBe('active');
  });

  // -------------------------------------------------------------------------
  // assertMembership — missing
  // -------------------------------------------------------------------------

  it('assertMembership throws AUTH_TENANT_MEMBERSHIP_MISSING when no row exists', async () => {
    let thrown: unknown;
    try {
      await adapter.assertMembership(ctx.seed.userId, '00000000-0000-0000-0000-000000000000');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthTenantMembershipMissing);
  });

  it('assertMembership throws AUTH_TENANT_MEMBERSHIP_MISSING for unknown user', async () => {
    let thrown: unknown;
    try {
      await adapter.assertMembership('00000000-0000-0000-0000-000000000000', ctx.seed.tenantId);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthTenantMembershipMissing);
  });

  // -------------------------------------------------------------------------
  // assertMembership — revoked
  // -------------------------------------------------------------------------

  it('assertMembership throws AUTH_TENANT_MEMBERSHIP_REVOKED for inactive membership', async () => {
    await ctx.db
      .updateTable('tenant_memberships')
      .set({ status: 'revoked' })
      .where('user_id', '=', ctx.seed.userId)
      .where('tenant_id', '=', ctx.seed.tenantId)
      .execute();

    let thrown: unknown;
    try {
      await adapter.assertMembership(ctx.seed.userId, ctx.seed.tenantId);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthTenantMembershipRevoked);
  });
});
