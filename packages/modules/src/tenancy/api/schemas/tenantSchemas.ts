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

const membershipRoleValues = ['owner', 'manager', 'staff'] as const;

const membershipRoleSchema = z.enum(membershipRoleValues, {
  errorMap: () => ({
    message: 'role must be one of owner, manager, staff'
  })
});

const membershipTargetPhoneSchema = z.string().trim().min(1, 'phone_e164 is required');

const ugandaPhonePolicy = new UgandaPhonePolicy();

const parseUgandaPhone = (
  value: string,
  fieldName: string,
  errorCode: ErrorCode.TenantSettingsInvalid | ErrorCode.TenantMemberTargetNotFound
): string => {
  try {
    const phone = PhoneNumber.parse(value);
    ugandaPhonePolicy.assertSupported(phone);
    return phone.toE164();
  } catch {
    throw new TenancyError({
      code: errorCode,
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

export const createTenantMembershipRequestSchema = z
  .object({
    phone_e164: membershipTargetPhoneSchema,
    role: membershipRoleSchema
  })
  .strict()
  .transform((value) => ({
    phoneE164: parseUgandaPhone(
      value.phone_e164,
      'phone_e164',
      ErrorCode.TenantMemberTargetNotFound
    ),
    role: value.role
  }));

export const tenantMembershipUserParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  userId: z.string().uuid('userId must be a valid UUID')
});

export const revokeTenantMembershipRequestSchema = z.object({}).strict();

export const updateTenantMembershipRoleRequestSchema = z
  .object({
    role: membershipRoleSchema
  })
  .strict()
  .transform((value) => ({
    role: value.role
  }));

const toSchemaValidationError = (
  code: ErrorCode.TenantMembershipRoleInvalid | ErrorCode.TenantMemberTargetNotFound,
  message: string
): never => {
  throw new TenancyError({
    code,
    message
  });
};

export const parseCreateTenantMembershipInput = (
  input: unknown
): { phoneE164: string; role: (typeof membershipRoleValues)[number] } => {
  const parsed = createTenantMembershipRequestSchema.safeParse(input);
  if (!parsed.success) {
    const roleIssue = parsed.error.issues.find((issue) => issue.path[0] === 'role');
    if (roleIssue !== undefined) {
      return toSchemaValidationError(ErrorCode.TenantMembershipRoleInvalid, roleIssue.message);
    }

    const phoneIssue = parsed.error.issues.find((issue) => issue.path[0] === 'phone_e164');
    if (phoneIssue !== undefined) {
      return toSchemaValidationError(ErrorCode.TenantMemberTargetNotFound, phoneIssue.message);
    }

    return toSchemaValidationError(
      ErrorCode.TenantMemberTargetNotFound,
      parsed.error.issues[0]?.message ?? 'Membership request is invalid'
    );
  }

  return parsed.data;
};

export const parseTenantMembershipUserParams = (
  input: unknown
): { tenantId: string; userId: string } => {
  const parsed = tenantMembershipUserParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new TenancyError({
      code: ErrorCode.TenantMemberTargetNotFound,
      message: parsed.error.issues[0]?.message ?? 'Membership target user is invalid'
    });
  }

  return parsed.data;
};

export const parseUpdateTenantMembershipRoleInput = (
  input: unknown
): { role: (typeof membershipRoleValues)[number] } => {
  const parsed = updateTenantMembershipRoleRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new TenancyError({
      code: ErrorCode.TenantMembershipRoleInvalid,
      message: parsed.error.issues[0]?.message ?? 'Membership role is invalid'
    });
  }

  return parsed.data;
};

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
          ? parseUgandaPhone(value.contact_phone, 'contact_phone', ErrorCode.TenantSettingsInvalid)
          : value.contact_phone,
      contactWhatsappE164:
        typeof value.contact_whatsapp === 'string'
          ? parseUgandaPhone(
              value.contact_whatsapp,
              'contact_whatsapp',
              ErrorCode.TenantSettingsInvalid
            )
          : value.contact_whatsapp,
      socialLinks: value.social_links,
      businessHours: value.business_hours
    };
  });
