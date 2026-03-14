import { beforeEach, describe, expect, it, vi } from 'vitest';

import { otpSink } from '@hypermarket/core/dev/otpSink';

describe('otpSink', () => {
  beforeEach(() => {
    vi.useRealTimers();
    otpSink.clear();
  });

  it('stores and retrieves OTP entries by challenge id', () => {
    const expiresAt = new Date(Date.now() + 60_000);

    otpSink.put('challenge-1', '123456', expiresAt);

    expect(otpSink.get('challenge-1')).toEqual({
      otpCode: '123456',
      expiresAt
    });
  });

  it('deletes stored entries', () => {
    otpSink.put('challenge-2', '654321', new Date(Date.now() + 60_000));

    expect(otpSink.delete('challenge-2')).toBe(true);
    expect(otpSink.get('challenge-2')).toBeNull();
    expect(otpSink.delete('challenge-2')).toBe(false);
  });

  it('does not retain entries that are already expired when put is called', () => {
    otpSink.put('challenge-3', '111111', new Date(Date.now() - 1_000));

    expect(otpSink.get('challenge-3')).toBeNull();
  });

  it('evicts expired entries on get', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T00:00:00.000Z'));

    otpSink.put('challenge-4', '222222', new Date('2026-03-15T00:00:10.000Z'));
    vi.setSystemTime(new Date('2026-03-15T00:00:11.000Z'));

    expect(otpSink.get('challenge-4')).toBeNull();
    expect(otpSink.delete('challenge-4')).toBe(false);
  });
});
