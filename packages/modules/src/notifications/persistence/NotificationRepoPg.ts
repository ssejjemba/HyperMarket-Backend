import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { NotificationJobStatus } from '../domain';

export type NotificationJobRecord = {
  id: string;
  tenantId: string;
  eventId: string;
  eventType: string;
  channel: 'whatsapp' | 'sms' | 'email';
  recipient: string;
  templateId: string;
  templateVersion: number;
  payload: Record<string, unknown>;
  dedupeKey: string;
  status: NotificationJobStatus;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  provider: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationDeliveryAttemptRecord = {
  id: string;
  tenantId: string;
  jobId: string;
  attemptNumber: number;
  provider: string;
  result: 'success' | 'failed';
  errorCode: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  createdAt: Date;
};

const mapJob = (row: DatabaseSchema['notification_jobs']): NotificationJobRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  eventId: row.event_id,
  eventType: row.event_type,
  channel: row.channel,
  recipient: row.recipient,
  templateId: row.template_id,
  templateVersion: row.template_version,
  payload: row.payload,
  dedupeKey: row.dedupe_key,
  status: row.status,
  attemptCount: row.attempt_count,
  lastErrorCode: row.last_error_code,
  lastErrorMessage: row.last_error_message,
  provider: row.provider,
  providerMessageId: row.provider_message_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapAttempt = (
  row: DatabaseSchema['notification_delivery_attempts']
): NotificationDeliveryAttemptRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  jobId: row.job_id,
  attemptNumber: row.attempt_number,
  provider: row.provider,
  result: row.result,
  errorCode: row.error_code,
  errorMessage: row.error_message,
  providerMessageId: row.provider_message_id,
  createdAt: row.created_at
});

export const createNotificationRepoPg = (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>
) => ({
  async insertJob(input: {
    tenantId: string;
    eventId: string;
    eventType: string;
    channel: 'whatsapp' | 'sms' | 'email';
    recipient: string;
    templateId: string;
    templateVersion: number;
    payload: Record<string, unknown>;
    dedupeKey: string;
  }): Promise<{ duplicate: boolean; job: NotificationJobRecord | null }> {
    const row = await db
      .insertInto('notification_jobs')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: input.tenantId,
        event_id: input.eventId,
        event_type: input.eventType,
        channel: input.channel,
        recipient: input.recipient,
        template_id: input.templateId,
        template_version: input.templateVersion,
        payload: input.payload,
        dedupe_key: input.dedupeKey,
        status: 'PENDING',
        attempt_count: 0,
        last_error_code: null,
        last_error_message: null,
        provider: null,
        provider_message_id: null,
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .onConflict((oc) => oc.column('dedupe_key').doNothing())
      .returningAll()
      .executeTakeFirst();

    if (row === undefined) {
      return {
        duplicate: true,
        job: null
      };
    }

    return {
      duplicate: false,
      job: mapJob(row)
    };
  },

  async getJobById(jobId: string): Promise<NotificationJobRecord | null> {
    const row = await db
      .selectFrom('notification_jobs')
      .selectAll()
      .where('id', '=', jobId)
      .executeTakeFirst();

    return row === undefined ? null : mapJob(row);
  },

  async updateJob(input: {
    jobId: string;
    status: NotificationJobStatus;
    attemptCount?: number;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    provider?: string | null;
    providerMessageId?: string | null;
  }): Promise<NotificationJobRecord | null> {
    const row = await db
      .updateTable('notification_jobs')
      .set({
        status: input.status,
        updated_at: new Date(),
        ...(input.attemptCount !== undefined ? { attempt_count: input.attemptCount } : {}),
        ...(input.lastErrorCode !== undefined ? { last_error_code: input.lastErrorCode } : {}),
        ...(input.lastErrorMessage !== undefined
          ? { last_error_message: input.lastErrorMessage }
          : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.providerMessageId !== undefined
          ? { provider_message_id: input.providerMessageId }
          : {})
      })
      .where('id', '=', input.jobId)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapJob(row);
  },

  async recordAttempt(input: {
    tenantId: string;
    jobId: string;
    attemptNumber: number;
    provider: string;
    result: 'success' | 'failed';
    errorCode?: string | null;
    errorMessage?: string | null;
    providerMessageId?: string | null;
  }): Promise<NotificationDeliveryAttemptRecord> {
    const row = await db
      .insertInto('notification_delivery_attempts')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: input.tenantId,
        job_id: input.jobId,
        attempt_number: input.attemptNumber,
        provider: input.provider,
        result: input.result,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        provider_message_id: input.providerMessageId ?? null,
        created_at: sql`now()`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapAttempt(row);
  },

  async listJobsByTenant(input: {
    tenantId: string;
    status?: NotificationJobStatus;
    limit: number;
  }): Promise<NotificationJobRecord[]> {
    let query = db
      .selectFrom('notification_jobs')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .orderBy('created_at', 'desc')
      .limit(input.limit);

    if (input.status !== undefined) {
      query = query.where('status', '=', input.status);
    }

    const rows = await query.execute();
    return rows.map(mapJob);
  }
});
