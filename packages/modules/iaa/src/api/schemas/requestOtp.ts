import { z } from 'zod';

export const requestOtpSchema = z.object({
  phone: z.string().min(7, 'phone must be at least 7 characters')
});

export type RequestOtpBody = z.infer<typeof requestOtpSchema>;
