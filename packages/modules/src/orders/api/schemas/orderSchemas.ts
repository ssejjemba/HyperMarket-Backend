import { z } from 'zod';

import { ErrorCode } from '@hypermarket/contracts';

import { OrderError } from '../../errors/OrderError';

const uuidParam = z.string().uuid('must be a valid UUID');

export const storefrontTenantParamsSchema = z.object({
  tenantSlug: z.string().min(1)
});

export const tenantIdParamsSchema = z.object({
  tenantId: uuidParam
});

export const orderParamsSchema = z.object({
  tenantId: uuidParam,
  orderId: uuidParam
});

const checkoutItemSchema = z
  .object({
    product_id: z.string().uuid().optional(),
    product_slug: z.string().min(1).optional(),
    variant_id: z.string().uuid().optional(),
    quantity: z.number().int().min(1)
  })
  .strict()
  .refine((value) => value.product_id !== undefined || value.product_slug !== undefined, {
    message: 'product_id or product_slug is required'
  });

const customerSchema = z
  .object({
    full_name: z.string().max(255).nullable().optional(),
    phone_e164: z.string().max(32).nullable().optional(),
    email: z.string().email().max(255).nullable().optional(),
    contact_preference: z.string().max(64).nullable().optional()
  })
  .strict();

const pickupFulfillmentSchema = z
  .object({
    type: z.literal('pickup'),
    pickup_location_label: z.string().min(1).max(255),
    instructions: z.string().max(2000).nullable().optional()
  })
  .strict();

const deliveryFulfillmentSchema = z
  .object({
    type: z.literal('delivery'),
    zone_id: z.string().min(1).nullable().optional(),
    zone_name: z.string().min(1).nullable().optional(),
    address_label: z.string().min(1).max(500),
    location_hint: z.string().max(500).nullable().optional(),
    recipient_name: z.string().min(1).max(255),
    recipient_phone: z.string().min(1).max(32),
    instructions: z.string().max(2000).nullable().optional()
  })
  .strict();

export const createOrderBodySchema = z
  .object({
    checkout_mode: z.enum(['pay_on_delivery', 'gateway_payment']),
    items: z.array(checkoutItemSchema).min(1),
    customer: customerSchema,
    fulfillment: z.union([pickupFulfillmentSchema, deliveryFulfillmentSchema]),
    notes: z.string().max(2000).nullable().optional()
  })
  .strict();

export const listOrdersQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'PAID', 'FAILED', 'FULFILLED', 'REFUNDED'])
    .optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const transitionOrderBodySchema = z
  .object({
    action: z.enum(['confirm', 'cancel', 'fulfill']),
    reason: z.string().max(2000).nullable().optional()
  })
  .strict();

export const parseOrderValidation = <T>(result: z.SafeParseReturnType<unknown, T>): T => {
  if (!result.success) {
    throw new OrderError({
      code: ErrorCode.OrderValidationFailed,
      message: result.error.issues[0]?.message ?? 'Order request is invalid',
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
