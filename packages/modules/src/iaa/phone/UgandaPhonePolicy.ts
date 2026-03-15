import { ErrorCode } from '@hypermarket/contracts';

import { IaaError } from '../errors/IaaError';
import type { PhoneNumber } from './PhoneNumber';

const UGANDA_E164_PREFIX = '+256';

export class UgandaPhonePolicy {
  assertSupported(phone: PhoneNumber): void {
    if (!phone.toE164().startsWith(UGANDA_E164_PREFIX)) {
      throw new IaaError({
        code: ErrorCode.AuthPhoneCountryNotSupported,
        message: 'Only Ugandan phone numbers are supported'
      });
    }
  }
}
