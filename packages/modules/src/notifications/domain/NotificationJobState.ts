import { ErrorCode } from '@hypermarket/contracts';

import { NotificationError } from '../errors/NotificationError';

export const NOTIFICATION_JOB_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED_RETRYABLE',
  'DEAD'
] as const;

export type NotificationJobStatus = (typeof NOTIFICATION_JOB_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<NotificationJobStatus, NotificationJobStatus[]> = {
  PENDING: ['PROCESSING', 'DEAD'],
  PROCESSING: ['SENT', 'FAILED_RETRYABLE', 'DEAD'],
  SENT: [],
  FAILED_RETRYABLE: ['PROCESSING', 'DEAD'],
  DEAD: []
};

export const assertNotificationJobTransition = (
  current: NotificationJobStatus,
  next: NotificationJobStatus
): NotificationJobStatus => {
  if (ALLOWED_TRANSITIONS[current].includes(next)) {
    return next;
  }

  throw new NotificationError({
    code: ErrorCode.NotDbFailure,
    message: `Invalid notification job transition from ${current} to ${next}`
  });
};
