import { z } from 'zod';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { NotificationJobStatus } from '../../../notifications/domain';
import type { PaymentIntentStatus } from '../../../payments/domain';
import type { OpsOutboxStatus } from '../../persistence/OpsRepoPg';
import type { OpsQueueTarget } from '../../runtime/OpsQueueClient';

export const tenantIdParamsSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID')
});

export const notificationJobParamsSchema = tenantIdParamsSchema.extend({
  jobId: z.string().uuid('jobId must be a valid UUID')
});

export const dlqTargetParamsSchema = tenantIdParamsSchema.extend({
  target: z.enum(['notifications', 'revalidation'])
});

export const dlqReplayParamsSchema = dlqTargetParamsSchema.extend({
  jobId: z.string().min(1, 'jobId is required')
});

export const outboxQuerySchema = z.object({
  status: z.enum(['pending', 'failed', 'dispatched']).optional(),
  event_type: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const paymentQuerySchema = z.object({
  status: z
    .enum([
      'CREATED',
      'PENDING_PROVIDER',
      'AWAITING_CUSTOMER',
      'SUCCEEDED',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
      'REFUNDED'
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const notificationQuerySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SENT', 'FAILED_RETRYABLE', 'DEAD']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const getMessage = (error: z.ZodError): string => error.issues[0]?.message ?? 'Request is invalid';

export const parseTenantIdParams = (input: unknown): { tenantId: string } => {
  const parsed = tenantIdParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};

export const parseNotificationJobParams = (input: unknown): { tenantId: string; jobId: string } => {
  const parsed = notificationJobParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};

export const parseDlqTargetParams = (
  input: unknown
): { tenantId: string; target: OpsQueueTarget } => {
  const parsed = dlqTargetParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};

export const parseDlqReplayParams = (
  input: unknown
): { tenantId: string; target: OpsQueueTarget; jobId: string } => {
  const parsed = dlqReplayParamsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};

export const parseOutboxQuery = (
  input: unknown
): {
  status?: OpsOutboxStatus | undefined;
  event_type?: string | undefined;
  limit?: number | undefined;
} => {
  const parsed = outboxQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};

export const parsePaymentQuery = (
  input: unknown
): { status?: PaymentIntentStatus | undefined; limit?: number | undefined } => {
  const parsed = paymentQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};

export const parseNotificationQuery = (
  input: unknown
): { status?: NotificationJobStatus | undefined; limit?: number | undefined } => {
  const parsed = notificationQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};

export const parseLimitQuery = (input: unknown): { limit?: number | undefined } => {
  const parsed = limitQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError({
      code: ErrorCode.ValidationFailed,
      message: getMessage(parsed.error)
    });
  }

  return parsed.data;
};
