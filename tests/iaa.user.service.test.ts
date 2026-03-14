import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { IaaError } from '@hypermarket/modules/iaa';
import { createUserRepoPg, createUserService } from '@hypermarket/modules/iaa/user';
import type { UserRepository } from '@hypermarket/modules/iaa/user';
import { PhoneNumber } from '@hypermarket/modules/iaa';

import type { UserService } from '@hypermarket/modules/iaa/user';

// ---------------------------------------------------------------------------
// Suite guard
// ---------------------------------------------------------------------------

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PHONE_A = PhoneNumber.parse('+254712000001');
const PHONE_B = PhoneNumber.parse('+254712000002');

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('UserService — integration', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let repo: UserRepository;
  let service: UserService;

  beforeEach(async () => {
    ctx = await createTestContext();
    repo = createUserRepoPg(ctx.db);

    // Clean only IAA user rows that don't conflict with other test seed data.
    // Use the deterministic phone prefixes used in this file.
    await ctx.db.deleteFrom('users').where('phone_e164', 'like', '+25471200000%').execute();

    service = createUserService({ repo });
  });

  afterEach(async () => {
    await ctx.destroy();
  });

  // -------------------------------------------------------------------------
  // First verified phone creates user
  // -------------------------------------------------------------------------

  it('first call with a new phone creates and returns a user', async () => {
    const user = await service.getOrCreateByPhone(PHONE_A);

    expect(user.id).toBeTruthy();
    expect(user.phoneE164).toBe(PHONE_A.toE164());
    expect(user.status).toBe('active');
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('created user is persisted and findByPhone returns it', async () => {
    const created = await service.getOrCreateByPhone(PHONE_A);
    const found = await repo.findByPhone(PHONE_A.toE164());

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  // -------------------------------------------------------------------------
  // Idempotency — same user returned on subsequent calls
  // -------------------------------------------------------------------------

  it('subsequent call with the same phone returns the same user', async () => {
    const first = await service.getOrCreateByPhone(PHONE_A);
    const second = await service.getOrCreateByPhone(PHONE_A);

    expect(second.id).toBe(first.id);
    expect(second.phoneE164).toBe(first.phoneE164);
  });

  it('different phones get different users', async () => {
    const userA = await service.getOrCreateByPhone(PHONE_A);
    const userB = await service.getOrCreateByPhone(PHONE_B);

    expect(userA.id).not.toBe(userB.id);
    expect(userA.phoneE164).toBe(PHONE_A.toE164());
    expect(userB.phoneE164).toBe(PHONE_B.toE164());
  });

  // -------------------------------------------------------------------------
  // Suspended user rejects auth
  // -------------------------------------------------------------------------

  it('suspended user throws AUTH_USER_SUSPENDED', async () => {
    // Create the user, then flip is_active to false directly in the DB
    const user = await service.getOrCreateByPhone(PHONE_A);

    await ctx.db.updateTable('users').set({ is_active: false }).where('id', '=', user.id).execute();

    let thrown: unknown;
    try {
      await service.getOrCreateByPhone(PHONE_A);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthUserSuspended);
  });

  it('suspended user has status "suspended" on the domain entity', async () => {
    const user = await service.getOrCreateByPhone(PHONE_A);

    await ctx.db.updateTable('users').set({ is_active: false }).where('id', '=', user.id).execute();

    const loaded = await repo.findByPhone(PHONE_A.toE164());
    expect(loaded!.status).toBe('suspended');
  });
});
