import type { AppConfigShape } from '@hypermarket/core';

import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../errors/PaymentError';
import { createMockMomoProvider } from '../provider';
import type { PaymentProvider } from '../provider';

export const createPaymentProviderRegistry = (config: AppConfigShape) => {
  const providers = new Map<string, PaymentProvider>();
  providers.set(
    'mock_momo',
    createMockMomoProvider({
      webhookSecret: config.paymentMockWebhookSecret
    })
  );

  return {
    getProvider(name: string): PaymentProvider {
      const provider = providers.get(name);
      if (provider === undefined) {
        throw new PaymentError({
          code: ErrorCode.PaymentProviderConfigInvalid,
          message: `Unsupported payment provider: ${name}`
        });
      }

      return provider;
    }
  };
};
