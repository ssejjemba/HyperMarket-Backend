import type { AppConfigShape } from '@hypermarket/core';

import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../errors/PaymentError';
import { createFlutterwaveProvider, createMockMomoProvider } from '../provider';
import type { PaymentProvider } from '../provider';

export const createPaymentProviderRegistry = (config: AppConfigShape) => {
  const providers = new Map<string, PaymentProvider>();
  if (config.flwSecretKey !== undefined && config.flwWebhookSecretHash !== undefined) {
    providers.set(
      'flutterwave',
      createFlutterwaveProvider({
        secretKey: config.flwSecretKey,
        webhookSecretHash: config.flwWebhookSecretHash,
        baseUrl: config.flwBaseUrl
      })
    );
  }
  providers.set(
    'mock_momo',
    createMockMomoProvider({
      webhookSecret: config.flwWebhookSecretHash ?? 'test-pay-webhook-secret'
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
