import { z } from 'zod';

export const verifyOtpSchema = z.object({
  challenge_id: z.string().uuid('challenge_id must be a valid UUID'),
  phone: z.string().min(7, 'phone must be at least 7 characters'),
  code: z.string().length(6, 'code must be exactly 6 digits')
});

export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
