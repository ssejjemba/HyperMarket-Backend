import { ErrorCode } from '@hypermarket/contracts';

import { IaaError, PhoneNumber, UgandaPhonePolicy } from '../../iaa';
import { PaymentError } from '../errors/PaymentError';

export class CustomerPhone {
  private constructor(private readonly value: string) {}

  static parse(input: string): CustomerPhone {
    try {
      const phone = PhoneNumber.parse(input);
      new UgandaPhonePolicy().assertSupported(phone);
      return new CustomerPhone(phone.toE164());
    } catch (error) {
      if (error instanceof IaaError) {
        throw new PaymentError({
          code: ErrorCode.PaymentPhoneInvalid,
          message: 'Customer phone must be a valid Ugandan E.164 number',
          cause: error
        });
      }

      throw error;
    }
  }

  toE164(): string {
    return this.value;
  }
}
