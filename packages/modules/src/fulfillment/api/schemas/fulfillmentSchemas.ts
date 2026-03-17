import { z } from 'zod';

import { ErrorCode } from '@hypermarket/contracts';

import { BUSINESS_DAY_KEYS, type BusinessDayKey } from '../../domain';
import { FulfillmentError } from '../../errors/FulfillmentError';

const uuidParam = z.string().uuid('must be a valid UUID');
const timeValueSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM');

export const storefrontTenantParamsSchema = z.object({
  tenantSlug: z.string().min(1)
});

export const tenantIdParamsSchema = z.object({
  tenantId: uuidParam
});

export const zoneParamsSchema = z.object({
  tenantId: uuidParam,
  zoneId: uuidParam
});

const businessHoursDaySchema = z
  .object({
    is_closed: z.boolean(),
    open_time: timeValueSchema.nullable().optional(),
    close_time: timeValueSchema.nullable().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.is_closed) {
      return;
    }

    if (value.open_time === undefined || value.open_time === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'open_time is required when is_closed is false'
      });
    }

    if (value.close_time === undefined || value.close_time === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'close_time is required when is_closed is false'
      });
    }
  });

const businessHoursShape = Object.fromEntries(
  BUSINESS_DAY_KEYS.map((day) => [day, businessHoursDaySchema.optional()])
) as Record<BusinessDayKey, z.ZodOptional<typeof businessHoursDaySchema>>;

const businessHoursSchema = z.object(businessHoursShape).strict();

export const updateSettingsBodySchema = z
  .object({
    pickup_enabled: z.boolean().optional(),
    delivery_enabled: z.boolean().optional(),
    pickup_instructions: z.string().max(2000).nullable().optional(),
    delivery_instructions: z.string().max(2000).nullable().optional(),
    business_hours: businessHoursSchema.optional()
  })
  .strict();

export const createZoneBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    fee_amount: z.number().int().min(0),
    min_order_amount: z.number().int().min(0).nullable().optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional()
  })
  .strict();

export const updateZoneBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    fee_amount: z.number().int().min(0).optional(),
    min_order_amount: z.number().int().min(0).nullable().optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional()
  })
  .strict();

export const listZonesQuerySchema = z.object({
  include_inactive: z.coerce.boolean().optional()
});

export const parseFulfillmentValidation = <T>(result: z.SafeParseReturnType<unknown, T>): T => {
  if (!result.success) {
    throw new FulfillmentError({
      code: ErrorCode.FulSettingsInvalid,
      message: result.error.issues[0]?.message ?? 'Fulfillment request is invalid',
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
