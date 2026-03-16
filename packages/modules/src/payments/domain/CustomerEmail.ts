import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../errors/PaymentError';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CustomerEmail {
  private constructor(private readonly value: string) {}

  static parse(input: string): CustomerEmail {
    const normalized = input.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new PaymentError({
        code: ErrorCode.PaymentProviderRejectedRequest,
        message: 'Customer email must be a valid email address'
      });
    }

    return new CustomerEmail(normalized);
  }

  toString(): string {
    return this.value;
  }
}
