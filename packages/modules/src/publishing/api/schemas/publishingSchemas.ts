import { AppError, ErrorCode } from '@hypermarket/contracts';
import { z } from 'zod';

export const tenantConfigParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  configId: z.string().uuid('configId must be a valid UUID')
});

export const createConfigRequestSchema = z.object({
  template_id: z.string().min(1, 'template_id is required'),
  template_version: z.string().min(1, 'template_version is required'),
  config_payload: z.record(z.unknown()).optional()
});

export const updateConfigRequestSchema = z.object({
  config_payload: z.record(z.unknown())
});

export const activateConfigRequestSchema = z.object({
  config_id: z.string().uuid('config_id must be a valid UUID')
});

export const parseTenantConfigParams = (
  input: unknown
): z.infer<typeof tenantConfigParamsSchema> => {
  const parsed = tenantConfigParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: parsed.error.errors[0]?.message ?? 'Invalid tenant config params'
    });
  }

  return parsed.data;
};

export const parseCreateConfigRequest = (
  input: unknown
): z.infer<typeof createConfigRequestSchema> => {
  const parsed = createConfigRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: parsed.error.errors[0]?.message ?? 'Invalid create config request'
    });
  }

  return parsed.data;
};

export const parseUpdateConfigRequest = (
  input: unknown
): z.infer<typeof updateConfigRequestSchema> => {
  const parsed = updateConfigRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: parsed.error.errors[0]?.message ?? 'Invalid update config request'
    });
  }

  return parsed.data;
};
