import { ErrorCode } from '@hypermarket/contracts';

import { IaaError, PhoneNumber, UgandaPhonePolicy } from '../../iaa';
import { NotificationError } from '../errors/NotificationError';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SmsRecipient {
  private constructor(private readonly value: string) {}

  static parse(input: string): SmsRecipient {
    try {
      const phone = PhoneNumber.parse(input);
      new UgandaPhonePolicy().assertSupported(phone);
      return new SmsRecipient(phone.toE164());
    } catch (error) {
      if (error instanceof IaaError) {
        throw new NotificationError({
          code: ErrorCode.NotRecipientInvalid,
          message: 'Notification recipient must be a valid Ugandan E.164 phone number',
          cause: error
        });
      }

      throw error;
    }
  }

  toString(): string {
    return this.value;
  }
}

export class EmailRecipient {
  private constructor(private readonly value: string) {}

  static parse(input: string): EmailRecipient {
    const normalized = input.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new NotificationError({
        code: ErrorCode.NotRecipientInvalid,
        message: 'Notification recipient must be a valid email address'
      });
    }

    return new EmailRecipient(normalized);
  }

  toString(): string {
    return this.value;
  }
}
