import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { canConnectDatabase, createTestContext } from '@hypermarket/core/testkit';
import { createOtpChallengeRepoPg } from '@hypermarket/modules/iaa/persistence';
import type { OtpChallengeRepository } from '@hypermarket/modules/iaa/persistence';

// ---------------------------------------------------------------------------
// Conditional suite — skipped automatically when Postgres is unavailable
// ---------------------------------------------------------------------------

const dbAvailable = await canConnectDatabase();
const suite = dbAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE = '+256712345678';
const CODE_HASH = 'sha256:abcdef1234567890';
const MAX_ATTEMPTS = 3;

function futureDate(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('OtpChallengeRepoPg — integration', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let repo: OtpChallengeRepository;

  beforeEach(async () => {
    ctx = await createTestContext();
    repo = createOtpChallengeRepoPg(ctx.db);

    // Start each test with a clean auth_otps table
    await ctx.db.deleteFrom('auth_otps').execute();
  });

  afterEach(async () => {
    await ctx.destroy();
  });

  // -------------------------------------------------------------------------
  // create + load round-trip
  // -------------------------------------------------------------------------

  it('createChallenge stores a row and getChallengeById retrieves it', async () => {
    const expiresAt = futureDate(5 * 60 * 1000); // +5 min
    const lastSentAt = new Date();

    const created = await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt,
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt
    });

    expect(created.id).toBeTruthy();
    expect(created.phoneE164).toBe(PHONE);
    expect(created.codeHash).toBe(CODE_HASH);
    expect(created.maxAttempts).toBe(MAX_ATTEMPTS);
    expect(created.attemptCount).toBe(0);
    expect(created.status).toBe('ACTIVE');
    expect(created.expiresAt.getTime()).toBeCloseTo(expiresAt.getTime(), -2);
    expect(created.createdAt).toBeInstanceOf(Date);

    const loaded = await repo.getChallengeById(created.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(created.id);
    expect(loaded!.phoneE164).toBe(PHONE);
    expect(loaded!.codeHash).toBe(CODE_HASH);
    expect(loaded!.status).toBe('ACTIVE');
    expect(loaded!.attemptCount).toBe(0);
  });

  it('getChallengeById returns null for unknown id', async () => {
    const result = await repo.getChallengeById('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // updateChallenge — attempt_count and status
  // -------------------------------------------------------------------------

  it('updateChallenge persists attempt_count increment', async () => {
    const challenge = await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt: futureDate(5 * 60 * 1000),
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: new Date()
    });

    const now = new Date();
    challenge.recordFailedAttempt(now);
    expect(challenge.attemptCount).toBe(1);

    await repo.updateChallenge(challenge);

    const reloaded = await repo.getChallengeById(challenge.id);
    expect(reloaded!.attemptCount).toBe(1);
    expect(reloaded!.status).toBe('ACTIVE');
  });

  it('updateChallenge persists LOCKED status after max attempts', async () => {
    const challenge = await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt: futureDate(5 * 60 * 1000),
      maxAttempts: 2,
      lastSentAt: new Date()
    });

    const now = new Date();
    challenge.recordFailedAttempt(now);
    challenge.recordFailedAttempt(now); // hits max → LOCKED
    expect(challenge.status).toBe('LOCKED');

    await repo.updateChallenge(challenge);

    const reloaded = await repo.getChallengeById(challenge.id);
    expect(reloaded!.status).toBe('LOCKED');
    expect(reloaded!.attemptCount).toBe(2);
  });

  it('updateChallenge persists CONSUMED status', async () => {
    const challenge = await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt: futureDate(5 * 60 * 1000),
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: new Date()
    });

    challenge.consume(new Date());
    expect(challenge.status).toBe('CONSUMED');

    await repo.updateChallenge(challenge);

    const reloaded = await repo.getChallengeById(challenge.id);
    expect(reloaded!.status).toBe('CONSUMED');
  });

  // -------------------------------------------------------------------------
  // Expiry field stored and read correctly
  // -------------------------------------------------------------------------

  it('stores expiresAt precisely and reads it back as a Date', async () => {
    // Use a fixed future timestamp with second-level precision
    const expiresAt = new Date(Date.now() + 300_000);
    expiresAt.setMilliseconds(0); // Postgres truncates sub-second in timestamp

    const challenge = await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt,
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: new Date()
    });

    const loaded = await repo.getChallengeById(challenge.id);
    expect(loaded!.expiresAt).toBeInstanceOf(Date);
    expect(loaded!.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('isExpired returns true after the stored expiresAt passes', async () => {
    // Store a challenge that expired in the past
    const expiresAt = new Date(Date.now() - 1000); // 1 s ago

    const challenge = await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt,
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: new Date()
    });

    const loaded = await repo.getChallengeById(challenge.id);
    expect(loaded!.isExpired(new Date())).toBe(true);
  });

  // -------------------------------------------------------------------------
  // countRecentChallengesForPhone
  // -------------------------------------------------------------------------

  it('countRecentChallengesForPhone counts only challenges within the window', async () => {
    // Subtract 1 s to ensure the Postgres `now()` for the inserted rows
    // falls within the window regardless of JS/Postgres clock micro-skew.
    const since = new Date(Date.now() - 1000);

    await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt: futureDate(5 * 60 * 1000),
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: new Date()
    });
    await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt: futureDate(5 * 60 * 1000),
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: new Date()
    });

    const count = await repo.countRecentChallengesForPhone(PHONE, since);
    expect(count).toBe(2);
  });

  it('countRecentChallengesForPhone does not count other phones', async () => {
    const since = new Date(Date.now() - 1000);
    const otherPhone = '+447911123456';

    await repo.createChallenge({
      phoneE164: PHONE,
      codeHash: CODE_HASH,
      expiresAt: futureDate(5 * 60 * 1000),
      maxAttempts: MAX_ATTEMPTS,
      lastSentAt: new Date()
    });

    const count = await repo.countRecentChallengesForPhone(otherPhone, since);
    expect(count).toBe(0);
  });
});
