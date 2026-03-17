export {
  assertNotificationJobTransition,
  createNotificationDedupeKey,
  EmailRecipient,
  getNotificationTemplate,
  maskNotificationRecipient,
  NOTIFICATION_JOB_STATUSES,
  renderNotificationTemplate,
  SmsRecipient
} from './domain';
export type {
  NotificationChannel,
  NotificationJobStatus,
  NotificationTemplateDefinition
} from './domain';
export { NotificationError } from './errors/NotificationError';
export type { NotificationErrorCode } from './errors/NotificationError';
