import { z } from 'zod';

import { ErrorCode } from '@hypermarket/contracts';

import { PaymentError } from '../../errors/PaymentError';

export const storefrontTenantParamsSchema = z.object({
  tenantSlug: z.string().min(1)
});

export const webhookProviderParamsSchema = z.object({
  provider: z.string().min(1)
});

export const createPaymentIntentBodySchema = z
  .object({
    order_id: z.string().uuid(),
    provider: z.string().min(1).optional(),
    customer_phone_e164: z.string().min(1),
    network: z.enum(['MTN', 'AIRTEL']),
    email: z.string().email()
  })
  .strict();

export const parsePaymentValidation = <T>(result: z.SafeParseReturnType<unknown, T>): T => {
  if (!result.success) {
    throw new PaymentError({
      code: ErrorCode.PaymentProviderRejectedRequest,
      message: result.error.issues[0]?.message ?? 'Payment request is invalid',
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  return result.data;
};
