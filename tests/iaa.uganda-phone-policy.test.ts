import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import { IaaError, PhoneNumber, UgandaPhonePolicy } from '@hypermarket/modules/iaa';

describe('UgandaPhonePolicy', () => {
  const policy = new UgandaPhonePolicy();

  it('accepts +256 phone numbers', () => {
    expect(() => policy.assertSupported(PhoneNumber.parse('+256712345678'))).not.toThrow();
  });

  it.each(['+12025550123', '+447911123456'])('rejects non-Ugandan phone number %s', (input) => {
    let thrown: unknown;

    try {
      policy.assertSupported(PhoneNumber.parse(input));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IaaError);
    expect((thrown as IaaError).code).toBe(ErrorCode.AuthPhoneCountryNotSupported);
  });
});
