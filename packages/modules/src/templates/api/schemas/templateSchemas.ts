import { AppError, ErrorCode } from '@hypermarket/contracts';
import { z } from 'zod';

export const templateIdParamsSchema = z.object({
  templateId: z.string().min(1, 'templateId is required')
});

export const templateVersionParamsSchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
  version: z.string().min(1, 'version is required')
});

export const parseTemplateIdParams = (input: unknown): z.infer<typeof templateIdParamsSchema> => {
  const parsed = templateIdParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: parsed.error.errors[0]?.message ?? 'Invalid template params'
    });
  }

  return parsed.data;
};

export const parseTemplateVersionParams = (
  input: unknown
): z.infer<typeof templateVersionParamsSchema> => {
  const parsed = templateVersionParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: parsed.error.errors[0]?.message ?? 'Invalid template params'
    });
  }

  return parsed.data;
};
