import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { createSessionRepoPg } from '@hypermarket/modules/iaa';

import type { SessionRepository } from '@hypermarket/modules/iaa';

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

suite('SessionRepoPg — integration', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let repo: SessionRepository;

  beforeEach(async () => {
    ctx = await createTestContext();
    repo = createSessionRepoPg(ctx.db);
    await ctx.db.deleteFrom('sessions').execute();
  });

  afterEach(async () => {
    await ctx.destroy();
  });

  it('createSession persists a row that getSessionById can fetch', async () => {
    const expiresAt = new Date(Date.now() + 60_000);

    const created = await repo.createSession(ctx.seed.userId, 'token-hash-1', expiresAt);
    const fetched = await repo.getSessionById(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched).toEqual({
      id: created.id,
      userId: ctx.seed.userId,
      tokenHash: 'token-hash-1',
      expiresAt,
      revokedAt: null,
      createdAt: fetched!.createdAt
    });
    expect(fetched!.createdAt).toBeInstanceOf(Date);
  });

  it('revokeSession marks the session as revoked', async () => {
    const created = await repo.createSession(
      ctx.seed.userId,
      'token-hash-2',
      new Date(Date.now() + 60_000)
    );

    await repo.revokeSession(created.id);

    const revoked = await repo.getSessionById(created.id);
    expect(revoked).not.toBeNull();
    expect(revoked!.revokedAt).toBeInstanceOf(Date);
  });
});
