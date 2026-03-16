import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../errors/PaymentError';

export const FLUTTERWAVE_NETWORKS = ['MTN', 'AIRTEL'] as const;

export type FlutterwaveNetworkName = (typeof FLUTTERWAVE_NETWORKS)[number];

export class FlutterwaveNetwork {
  private constructor(private readonly value: FlutterwaveNetworkName) {}

  static parse(input: string): FlutterwaveNetwork {
    const normalized = input.trim().toUpperCase();
    if (!FLUTTERWAVE_NETWORKS.includes(normalized as FlutterwaveNetworkName)) {
      throw new PaymentError({
        code: ErrorCode.PaymentProviderRejectedRequest,
        message: 'Network must be MTN or AIRTEL'
      });
    }

    return new FlutterwaveNetwork(normalized as FlutterwaveNetworkName);
  }

  toString(): FlutterwaveNetworkName {
    return this.value;
  }
}
