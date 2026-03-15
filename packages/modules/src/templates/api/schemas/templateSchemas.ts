import { z } from 'zod';

export const templateIdParamsSchema = z.object({
  templateId: z.string().min(1, 'templateId is required')
});

export const templateVersionParamsSchema = z.object({
  templateId: z.string().min(1, 'templateId is required'),
  version: z.string().min(1, 'version is required')
});
