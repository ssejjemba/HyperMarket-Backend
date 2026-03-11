import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { IaaError, PhoneNumber } from '@hypermarket/modules/iaa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const expectPhoneError = (fn: () => unknown) => {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(IaaError);
  expect((thrown as IaaError).code).toBe(ErrorCode.AuthInvalidPhoneFormat);
};

// ---------------------------------------------------------------------------
// Valid E.164 inputs
// ---------------------------------------------------------------------------

describe('PhoneNumber.parse — valid E.164', () => {
  const valid: [string, string][] = [
    ['+256712345678', '+256712345678'], // Uganda mobile (12 digits)
    ['+447911123456', '+447911123456'], // UK mobile (12 digits)
    ['+12025550123', '+12025550123'], // US (11 digits)
    ['+33612345678', '+33612345678'], // France (11 digits)
    ['+6598765432', '+6598765432'], // Singapore (10 digits)
    ['+6761234567', '+6761234567'], // Solomon Islands (10 digits)
    ['+6831234', '+6831234'], // Niue — 7 digits (E.164 minimum)
    ['+999123456789012', '+999123456789012'] // 15 digits — E.164 maximum
  ];

  it.each(valid)('parse(%s).toE164() === %s', (input, expected) => {
    const phone = PhoneNumber.parse(input);
    expect(phone.toE164()).toBe(expected);
  });

  it('returns a new PhoneNumber instance each call', () => {
    const a = PhoneNumber.parse('+256712345678');
    const b = PhoneNumber.parse('+256712345678');
    expect(a).not.toBe(b);
    expect(a.toE164()).toBe(b.toE164());
  });
});

// ---------------------------------------------------------------------------
// Invalid inputs — must throw IaaError(AuthInvalidPhoneFormat)
// ---------------------------------------------------------------------------

describe('PhoneNumber.parse — invalid formats', () => {
  it('rejects empty string', () => {
    expectPhoneError(() => PhoneNumber.parse(''));
  });

  it('rejects a number without + prefix', () => {
    expectPhoneError(() => PhoneNumber.parse('256712345678'));
  });

  it('rejects + with no digits', () => {
    expectPhoneError(() => PhoneNumber.parse('+'));
  });

  it('rejects country code starting with 0', () => {
    expectPhoneError(() => PhoneNumber.parse('+0123456789'));
  });

  it('rejects spaces within the number', () => {
    expectPhoneError(() => PhoneNumber.parse('+256 712 345 678'));
  });

  it('rejects leading space before +', () => {
    expectPhoneError(() => PhoneNumber.parse(' +256712345678'));
  });

  it('rejects trailing space', () => {
    expectPhoneError(() => PhoneNumber.parse('+256712345678 '));
  });

  it('rejects dashes', () => {
    expectPhoneError(() => PhoneNumber.parse('+1-800-555-0199'));
  });

  it('rejects parentheses', () => {
    expectPhoneError(() => PhoneNumber.parse('(+1)8005550199'));
  });

  it('rejects non-digit characters after +', () => {
    expectPhoneError(() => PhoneNumber.parse('+44abc123'));
  });

  it('rejects too few digits (6 after +, below minimum of 7)', () => {
    expectPhoneError(() => PhoneNumber.parse('+123456'));
  });

  it('rejects too many digits (16 after +, above E.164 maximum of 15)', () => {
    expectPhoneError(() => PhoneNumber.parse('+1234567890123456'));
  });

  it('rejects 00 international prefix instead of +', () => {
    expectPhoneError(() => PhoneNumber.parse('00256712345678'));
  });

  it('rejects local format with no country code', () => {
    expectPhoneError(() => PhoneNumber.parse('0712345678'));
  });

  it('error code is AUTH_INVALID_PHONE_FORMAT', () => {
    let err: unknown;
    try {
      PhoneNumber.parse('bad');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(IaaError);
    expect((err as IaaError).code).toBe(ErrorCode.AuthInvalidPhoneFormat);
  });
});

// ---------------------------------------------------------------------------
// toMasked — determinism and safety
// ---------------------------------------------------------------------------

describe('PhoneNumber.toMasked', () => {
  it('masks all but the last 4 digits', () => {
    const phone = PhoneNumber.parse('+256712345678');
    // digits after + : 256712345678 (12 digits), reveal last 4 → 5678
    expect(phone.toMasked()).toBe('+********5678');
  });

  it('preserves the + prefix', () => {
    const masked = PhoneNumber.parse('+447911123456').toMasked();
    expect(masked.startsWith('+')).toBe(true);
  });

  it('output is deterministic for the same input', () => {
    const a = PhoneNumber.parse('+256712345678').toMasked();
    const b = PhoneNumber.parse('+256712345678').toMasked();
    expect(a).toBe(b);
  });

  it('never reveals the full phone number', () => {
    const e164 = '+256712345678';
    const phone = PhoneNumber.parse(e164);
    const masked = phone.toMasked();
    expect(masked).not.toBe(e164);
    expect(masked).toContain('*');
  });

  it('always masks at least 3 characters (minimum E.164 with 7 digits)', () => {
    // +1234567 — 7 digits, reveal 4, mask 3
    const phone = PhoneNumber.parse('+1234567');
    const masked = phone.toMasked();
    const starCount = (masked.match(/\*/g) ?? []).length;
    expect(starCount).toBeGreaterThanOrEqual(3);
  });

  it('masked length equals e164 length (same character count)', () => {
    const e164 = '+256712345678';
    const phone = PhoneNumber.parse(e164);
    expect(phone.toMasked()).toHaveLength(e164.length);
  });

  it('masked result does not contain digits before the revealed suffix', () => {
    const phone = PhoneNumber.parse('+447911123456');
    const masked = phone.toMasked(); // +*******3456
    // Everything between + and the last 4 should be *
    const inner = masked.slice(1, -4);
    expect(/^\*+$/.test(inner)).toBe(true);
  });

  it('correctly masks a 15-digit E.164 (maximum length)', () => {
    const phone = PhoneNumber.parse('+999123456789012');
    const masked = phone.toMasked();
    // digits: 999123456789012 (15 digits), reveal last 4 → 9012, mask 11
    expect(masked).toBe('+***********9012');
    expect(masked).toHaveLength('+999123456789012'.length);
  });
});
