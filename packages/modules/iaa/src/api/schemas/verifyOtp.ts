import { z } from 'zod';

export const verifyOtpSchema = z.object({
  phone: z.string().min(7, 'phone must be at least 7 characters'),
  code: z.string().min(4, 'code must be at least 4 characters')
});

export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
