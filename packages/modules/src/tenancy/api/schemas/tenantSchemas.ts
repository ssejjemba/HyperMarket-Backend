import { z } from 'zod';

import { ErrorCode } from '@hypermarket/contracts';

import { TenancyError } from '../../errors/TenancyError';
import { PhoneNumber } from '../../../iaa/phone/PhoneNumber';
import { UgandaPhonePolicy } from '../../../iaa/phone/UgandaPhonePolicy';

export const createTenantRequestSchema = z.object({
  business_name: z.string().min(1, 'business_name is required').max(255),
  slug: z.string().min(1).max(63).optional()
});

export const tenantIdParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID')
});

export const tenantMembershipRevokeSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID')
});

const ugandaPhonePolicy = new UgandaPhonePolicy();

const parseUgandaPhone = (value: string, fieldName: string): string => {
  try {
    const phone = PhoneNumber.parse(value);
    ugandaPhonePolicy.assertSupported(phone);
    return phone.toE164();
  } catch {
    throw new TenancyError({
      code: ErrorCode.TenantSettingsInvalid,
      message: `${fieldName} must be a valid Ugandan phone number`
    });
  }
};

const nullableTrimmedString = z.union([z.string().trim().max(255), z.null()]).optional();

const socialLinksSchema = z
  .object({
    website: z.string().trim().url().optional(),
    facebook: z.string().trim().url().optional(),
    instagram: z.string().trim().url().optional(),
    x: z.string().trim().url().optional(),
    tiktok: z.string().trim().url().optional()
  })
  .strict()
  .optional();

const timeValueSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM');

const businessHoursDaySchema = z
  .object({
    closed: z.boolean(),
    open: timeValueSchema.optional(),
    close: timeValueSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.closed) {
      return;
    }

    if (value.open === undefined || value.close === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'open and close are required when closed is false'
      });
    }
  });

const businessHoursSchema = z
  .object({
    monday: businessHoursDaySchema.optional(),
    tuesday: businessHoursDaySchema.optional(),
    wednesday: businessHoursDaySchema.optional(),
    thursday: businessHoursDaySchema.optional(),
    friday: businessHoursDaySchema.optional(),
    saturday: businessHoursDaySchema.optional(),
    sunday: businessHoursDaySchema.optional()
  })
  .strict()
  .optional();

export const updateTenantSettingsSchema = z
  .object({
    contact_name: nullableTrimmedString,
    contact_email: z.union([z.string().trim().email(), z.null()]).optional(),
    contact_phone: z.union([z.string().trim(), z.null()]).optional(),
    contact_whatsapp: z.union([z.string().trim(), z.null()]).optional(),
    social_links: socialLinksSchema,
    business_hours: businessHoursSchema
  })
  .strict()
  .transform((value) => {
    return {
      contactName: value.contact_name,
      contactEmail: value.contact_email,
      contactPhoneE164:
        typeof value.contact_phone === 'string'
          ? parseUgandaPhone(value.contact_phone, 'contact_phone')
          : value.contact_phone,
      contactWhatsappE164:
        typeof value.contact_whatsapp === 'string'
          ? parseUgandaPhone(value.contact_whatsapp, 'contact_whatsapp')
          : value.contact_whatsapp,
      socialLinks: value.social_links,
      businessHours: value.business_hours
    };
  });
