import { runInTransaction, type DatabaseSchema, type OutboxRecord } from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';
import type { Kysely } from 'kysely';
import type { BaseLogger } from 'pino';

import {
  assertNotificationJobTransition,
  createNotificationDedupeKey,
  maskNotificationRecipient,
  renderNotificationTemplate
} from '../domain';
import { NotificationError } from '../errors/NotificationError';
import { createNotificationRepoPg } from '../persistence/NotificationRepoPg';
import type { NotificationProvider, NotificationProviderSendResult } from '../provider';
import { buildNotificationPlan } from './NotificationPlanBuilder';

export const createNotificationUseCases = (deps: {
  db: Kysely<DatabaseSchema>;
  logger: BaseLogger;
  provider?: NotificationProvider | undefined;
}) => ({
  async scheduleFromOutboxEvent(event: OutboxRecord) {
    return runInTransaction(deps.db, async (trx) => {
      const repo = createNotificationRepoPg(trx);
      const plan = buildNotificationPlan(event);
      let createdCount = 0;
      let dedupedCount = 0;
      const createdJobIds: string[] = [];

      for (const notification of plan) {
        const dedupeKey = createNotificationDedupeKey({
          tenantId: event.tenantId ?? '',
          channel: notification.channel,
          templateId: notification.templateId,
          templateVersion: notification.templateVersion,
          recipient: notification.recipient,
          eventId: event.id
        });
        const result = await repo.insertJob({
          tenantId: event.tenantId ?? '',
          eventId: event.id,
          eventType: event.eventType,
          channel: notification.channel,
          recipient: notification.recipient,
          templateId: notification.templateId,
          templateVersion: notification.templateVersion,
          payload: notification.payload,
          dedupeKey
        });

        if (result.duplicate) {
          dedupedCount += 1;
          deps.logger.info(
            {
              eventId: event.id,
              tenantId: event.tenantId,
              channel: notification.channel,
              templateId: notification.templateId,
              recipient: maskNotificationRecipient(notification.recipient)
            },
            'notification.job.deduped'
          );
          continue;
        }

        createdCount += 1;
        if (result.job !== null) {
          createdJobIds.push(result.job.id);
        }
        deps.logger.info(
          {
            eventId: event.id,
            tenantId: event.tenantId,
            jobId: result.job?.id,
            channel: notification.channel,
            templateId: notification.templateId,
            recipient: maskNotificationRecipient(notification.recipient)
          },
          'notification.job.created'
        );
      }

      return {
        createdCount,
        dedupedCount,
        createdJobIds
      };
    });
  },

  async dispatchJob(jobId: string) {
    if (deps.provider === undefined) {
      throw new NotificationError({
        code: ErrorCode.NotProviderUnavailable,
        message: 'Notification dispatcher is not configured'
      });
    }
    const provider = deps.provider;

    return runInTransaction(deps.db, async (trx) => {
      const repo = createNotificationRepoPg(trx);
      const existing = await repo.getJobById(jobId);
      if (existing === null) {
        throw new NotificationError({
          code: ErrorCode.NotJobNotFound,
          message: 'Notification job not found'
        });
      }

      assertNotificationJobTransition(existing.status, 'PROCESSING');
      const processing = await repo.updateJob({
        jobId,
        status: 'PROCESSING'
      });
      if (processing === null) {
        throw new NotificationError({
          code: ErrorCode.NotJobNotFound,
          message: 'Notification job not found'
        });
      }

      const rendered = renderNotificationTemplate({
        channel: processing.channel,
        templateId: processing.templateId,
        templateVersion: processing.templateVersion,
        payload: processing.payload
      });
      const result: NotificationProviderSendResult = await provider.send({
        channel: processing.channel,
        recipient: processing.recipient,
        text: rendered.text,
        payload: processing.payload
      });
      const attemptNumber = processing.attemptCount + 1;

      await repo.recordAttempt({
        tenantId: processing.tenantId,
        jobId: processing.id,
        attemptNumber,
        provider: result.provider,
        result: result.status === 'SENT' ? 'success' : 'failed',
        ...(result.errorCode !== undefined ? { errorCode: result.errorCode } : {}),
        ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
        ...(result.providerMessageId !== undefined
          ? { providerMessageId: result.providerMessageId }
          : {})
      });

      if (result.status === 'SENT') {
        return (await repo.updateJob({
          jobId: processing.id,
          status: 'SENT',
          attemptCount: attemptNumber,
          provider: result.provider,
          providerMessageId: result.providerMessageId ?? null,
          lastErrorCode: null,
          lastErrorMessage: null
        }))!;
      }

      const nextStatus = result.retryable ? 'FAILED_RETRYABLE' : 'DEAD';
      return (await repo.updateJob({
        jobId: processing.id,
        status: nextStatus,
        attemptCount: attemptNumber,
        provider: result.provider,
        providerMessageId: result.providerMessageId ?? null,
        lastErrorCode: result.errorCode ?? null,
        lastErrorMessage: result.errorMessage ?? null
      }))!;
    });
  }
});
