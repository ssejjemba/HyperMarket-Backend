import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../errors/IaaError';

/**
 * Strict E.164:
 *   + followed by the country code and subscriber number
 *   Total digits: 7–15 (ITU-T E.164 cap is 15; 7 is the practical minimum)
 *   First digit after '+' must be 1–9 (no leading zero in country code)
 *   No spaces, dashes, parentheses, or other characters accepted.
 */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

const MASKED_REVEAL_COUNT = 4;

/**
 * Immutable value object representing a validated E.164 phone number.
 *
 * Construction is only possible via `PhoneNumber.parse()`, which throws
 * `IaaError(AuthInvalidPhoneFormat)` for any input that does not strictly
 * conform to E.164. No silent coercion is performed.
 */
export class PhoneNumber {
  private constructor(private readonly e164: string) {}

  /**
   * Parse and validate a phone number string.
   *
   * Accepts ONLY strict E.164: `+` followed by 7–15 digits with a
   * non-zero leading digit. Throws on any deviation — do not pre-process
   * the caller's input before passing it here.
   */
  static parse(input: string): PhoneNumber {
    if (typeof input !== 'string' || input.length === 0) {
      throw new IaaError({
        code: ErrorCode.AuthInvalidPhoneFormat,
        message: 'Phone number is required'
      });
    }

    if (!E164_REGEX.test(input)) {
      throw new IaaError({
        code: ErrorCode.AuthInvalidPhoneFormat,
        message: 'Phone number must be in E.164 format (e.g. +256712345678)'
      });
    }

    return new PhoneNumber(input);
  }

  /** Returns the canonical E.164 representation, e.g. `+256712345678`. */
  toE164(): string {
    return this.e164;
  }

  /**
   * Returns a masked representation that hides all but the last
   * `MASKED_REVEAL_COUNT` digits, e.g. `+256712345678` → `+*******5678`.
   *
   * The `+` prefix is always preserved. At least three digits are always
   * masked (given the E.164 minimum of 7 digits and a reveal count of 4).
   */
  toMasked(): string {
    const digits = this.e164.slice(1); // strip leading '+'
    const maskCount = digits.length - MASKED_REVEAL_COUNT;
    return '+' + '*'.repeat(maskCount) + digits.slice(-MASKED_REVEAL_COUNT);
  }
}
