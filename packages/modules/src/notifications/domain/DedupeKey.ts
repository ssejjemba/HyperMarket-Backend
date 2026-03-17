import { createHash } from 'node:crypto';

export const createNotificationDedupeKey = (input: {
  tenantId: string;
  channel: string;
  templateId: string;
  templateVersion: number;
  recipient: string;
  eventId: string;
}): string =>
  createHash('sha256')
    .update(
      [
        input.tenantId,
        input.channel,
        input.templateId,
        String(input.templateVersion),
        input.recipient,
        input.eventId
      ].join(':')
    )
    .digest('hex');
