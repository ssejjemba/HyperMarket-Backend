import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { IaaError, OtpChallenge, OtpChallengePolicy } from '@hypermarket/modules/iaa';
import type { OtpChallengeProps } from '@hypermarket/modules/iaa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-01T12:00:00.000Z');
const FUTURE = new Date(NOW.getTime() + 10 * 60 * 1000); // +10 min
const PAST = new Date(NOW.getTime() - 1); // 1 ms before now

function makeChallenge(overrides: Partial<OtpChallengeProps> = {}): OtpChallenge {
  return new OtpChallenge({
    id: 'chall-1',
    phoneE164: '+256712345678',
    codeHash: 'hash-abc',
    expiresAt: FUTURE,
    attemptCount: 0,
    maxAttempts: 3,
    status: 'ACTIVE',
    createdAt: NOW,
    lastSentAt: NOW,
    ...overrides
  });
}

function expectIaaError(fn: () => unknown, code: ErrorCode): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(IaaError);
  expect((thrown as IaaError).code).toBe(code);
}

// ---------------------------------------------------------------------------
// OtpChallenge — expiry
// ---------------------------------------------------------------------------

describe('OtpChallenge — expiry', () => {
  it('isExpired returns false when expiresAt is in the future', () => {
    const c = makeChallenge({ expiresAt: FUTURE });
    expect(c.isExpired(NOW)).toBe(false);
  });

  it('isExpired returns true when now equals expiresAt', () => {
    const c = makeChallenge({ expiresAt: NOW });
    expect(c.isExpired(NOW)).toBe(true);
  });

  it('isExpired returns true when now is past expiresAt', () => {
    const c = makeChallenge({ expiresAt: PAST });
    expect(c.isExpired(NOW)).toBe(true);
  });

  it('assertActive throws AuthChallengeExpired when expired', () => {
    const c = makeChallenge({ expiresAt: PAST });
    expectIaaError(() => c.assertActive(NOW), ErrorCode.AuthChallengeExpired);
  });

  it('assertActive sets status to EXPIRED when expiry detected', () => {
    const c = makeChallenge({ expiresAt: PAST });
    try {
      c.assertActive(NOW);
    } catch {
      // expected
    }
    expect(c.status).toBe('EXPIRED');
  });

  it('assertActive does not throw when ACTIVE and not expired', () => {
    const c = makeChallenge();
    expect(() => c.assertActive(NOW)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// OtpChallenge — phone mismatch
// ---------------------------------------------------------------------------

describe('OtpChallenge — phone mismatch', () => {
  it('assertPhoneMatches does not throw when phones match', () => {
    const c = makeChallenge();
    expect(() => c.assertPhoneMatches('+256712345678')).not.toThrow();
  });

  it('assertPhoneMatches throws AuthChallengePhoneMismatch on different number', () => {
    const c = makeChallenge();
    expectIaaError(
      () => c.assertPhoneMatches('+256799999999'),
      ErrorCode.AuthChallengePhoneMismatch
    );
  });

  it('assertPhoneMatches throws on empty string', () => {
    const c = makeChallenge();
    expectIaaError(() => c.assertPhoneMatches(''), ErrorCode.AuthChallengePhoneMismatch);
  });
});

// ---------------------------------------------------------------------------
// OtpChallenge — failed attempts and locking
// ---------------------------------------------------------------------------

describe('OtpChallenge — recordFailedAttempt', () => {
  it('increments attemptCount on each failure', () => {
    const c = makeChallenge({ maxAttempts: 3 });
    c.recordFailedAttempt(NOW);
    expect(c.attemptCount).toBe(1);
    c.recordFailedAttempt(NOW);
    expect(c.attemptCount).toBe(2);
  });

  it('transitions to LOCKED when maxAttempts is reached', () => {
    const c = makeChallenge({ maxAttempts: 3 });
    c.recordFailedAttempt(NOW);
    c.recordFailedAttempt(NOW);
    c.recordFailedAttempt(NOW);
    expect(c.status).toBe('LOCKED');
  });

  it('throws AuthChallengeLocked on any subsequent call after locking', () => {
    const c = makeChallenge({ maxAttempts: 1 });
    c.recordFailedAttempt(NOW); // reaches max → LOCKED
    expectIaaError(() => c.recordFailedAttempt(NOW), ErrorCode.AuthChallengeLocked);
  });

  it('does not lock before maxAttempts is reached', () => {
    const c = makeChallenge({ maxAttempts: 5 });
    c.recordFailedAttempt(NOW);
    c.recordFailedAttempt(NOW);
    expect(c.status).toBe('ACTIVE');
  });

  it('throws AuthChallengeExpired if expired when recording failure', () => {
    const c = makeChallenge({ expiresAt: PAST });
    expectIaaError(() => c.recordFailedAttempt(NOW), ErrorCode.AuthChallengeExpired);
  });
});

// ---------------------------------------------------------------------------
// OtpChallenge — consume
// ---------------------------------------------------------------------------

describe('OtpChallenge — consume', () => {
  it('transitions status to CONSUMED', () => {
    const c = makeChallenge();
    c.consume(NOW);
    expect(c.status).toBe('CONSUMED');
  });

  it('throws AuthChallengeConsumed when consumed a second time', () => {
    const c = makeChallenge();
    c.consume(NOW);
    expectIaaError(() => c.consume(NOW), ErrorCode.AuthChallengeConsumed);
  });

  it('throws AuthChallengeExpired when challenge is expired', () => {
    const c = makeChallenge({ expiresAt: PAST });
    expectIaaError(() => c.consume(NOW), ErrorCode.AuthChallengeExpired);
  });

  it('throws AuthChallengeLocked when challenge is locked', () => {
    const c = makeChallenge({ status: 'LOCKED' });
    expectIaaError(() => c.consume(NOW), ErrorCode.AuthChallengeLocked);
  });
});

// ---------------------------------------------------------------------------
// OtpChallenge — assertActive edge cases
// ---------------------------------------------------------------------------

describe('OtpChallenge — assertActive', () => {
  it('throws AuthChallengeLocked for LOCKED status (checked before expiry)', () => {
    // Even if we set expiresAt in the past, LOCKED takes priority
    const c = makeChallenge({ status: 'LOCKED', expiresAt: PAST });
    expectIaaError(() => c.assertActive(NOW), ErrorCode.AuthChallengeLocked);
  });

  it('throws AuthChallengeConsumed for CONSUMED status', () => {
    const c = makeChallenge({ status: 'CONSUMED' });
    expectIaaError(() => c.assertActive(NOW), ErrorCode.AuthChallengeConsumed);
  });

  it('throws AuthChallengeExpired for EXPIRED status (non-expired time)', () => {
    const c = makeChallenge({ status: 'EXPIRED', expiresAt: FUTURE });
    expectIaaError(() => c.assertActive(NOW), ErrorCode.AuthChallengeExpired);
  });

  it('throws AuthChallengeExpired for SEND_FAILED status', () => {
    const c = makeChallenge({ status: 'SEND_FAILED' });
    expectIaaError(() => c.assertActive(NOW), ErrorCode.AuthChallengeExpired);
  });
});

// ---------------------------------------------------------------------------
// OtpChallenge — recordSent
// ---------------------------------------------------------------------------

describe('OtpChallenge — recordSent', () => {
  it('updates lastSentAt', () => {
    const c = makeChallenge({ lastSentAt: NOW });
    const later = new Date(NOW.getTime() + 60_000);
    c.recordSent(later);
    expect(c.lastSentAt).toBe(later);
  });
});

// ---------------------------------------------------------------------------
// OtpChallengePolicy — canResend
// ---------------------------------------------------------------------------

describe('OtpChallengePolicy — canResend', () => {
  const policy = new OtpChallengePolicy({
    challengeTtlSeconds: 300,
    resendCooldownSeconds: 60,
    maxAttempts: 5
  });

  it('returns true when cooldown has elapsed', () => {
    const lastSent = new Date(NOW.getTime() - 60_000); // exactly 60 s ago
    expect(policy.canResend(lastSent, NOW)).toBe(true);
  });

  it('returns true when more than cooldown has elapsed', () => {
    const lastSent = new Date(NOW.getTime() - 120_000); // 2 min ago
    expect(policy.canResend(lastSent, NOW)).toBe(true);
  });

  it('returns false when cooldown has not elapsed', () => {
    const lastSent = new Date(NOW.getTime() - 30_000); // 30 s ago
    expect(policy.canResend(lastSent, NOW)).toBe(false);
  });

  it('returns false when lastSentAt equals now (0 elapsed)', () => {
    expect(policy.canResend(NOW, NOW)).toBe(false);
  });

  it('exposes configured values', () => {
    expect(policy.challengeTtlSeconds).toBe(300);
    expect(policy.resendCooldownSeconds).toBe(60);
    expect(policy.maxAttempts).toBe(5);
  });
});
