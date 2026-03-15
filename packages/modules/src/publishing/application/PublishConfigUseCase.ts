import type { Kysely } from 'kysely';

import {
  createAuditWriter,
  createOutboxWriter,
  runInTransaction,
  type DatabaseSchema
} from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';

import type { ValidationReport } from '../domain';
import { PublishingError } from '../errors/PublishingError';
import { createStoreConfigRepoPg } from '../persistence';
import { toAuditRequestId } from './auditRequestId';

export type PublishConfigInput = {
  tenantId: string;
  configId: string;
  actorUserId: string;
  requestId?: string | undefined;
};

export type PublishConfigOutput = {
  configId: string;
  activeConfigId: string;
  previousConfigId: string | null;
};

export type PublishConfigUseCase = {
  execute(input: PublishConfigInput): Promise<PublishConfigOutput>;
};

export type PublishConfigUseCaseDeps = {
  db: Kysely<DatabaseSchema>;
  configValidator: {
    validate(templateId: string, templateVersion: string, payload: unknown): ValidationReport;
  };
};

const toAuditPayload = (config: {
  id: string;
  tenantId: string;
  status: string;
  templateId: string;
  templateVersion: string;
  configVersion: number;
  configPayload: Record<string, unknown>;
}): Record<string, unknown> => ({
  id: config.id,
  tenant_id: config.tenantId,
  status: config.status,
  template_id: config.templateId,
  template_version: config.templateVersion,
  config_version: config.configVersion,
  config_payload: config.configPayload
});

export const createPublishConfigUseCase = (
  deps: PublishConfigUseCaseDeps
): PublishConfigUseCase => {
  const auditWriter = createAuditWriter();
  const outboxWriter = createOutboxWriter();

  return {
    async execute(input) {
      return runInTransaction(deps.db, async (trx) => {
        const repo = createStoreConfigRepoPg(trx);
        const targetConfig = await repo.getConfigById(input.tenantId, input.configId);

        if (targetConfig === null) {
          throw new PublishingError({
            code: ErrorCode.ConfigNotFound,
            message: 'Config not found',
            details: {
              tenant_id: input.tenantId,
              config_id: input.configId
            }
          });
        }

        const activeConfig = await repo.getActiveConfig(input.tenantId);
        if (activeConfig?.id === targetConfig.id) {
          throw new PublishingError({
            code: ErrorCode.ConfigAlreadyActive,
            message: 'Config is already active',
            details: {
              tenant_id: input.tenantId,
              config_id: input.configId
            }
          });
        }

        const validationReport = deps.configValidator.validate(
          targetConfig.templateId,
          targetConfig.templateVersion,
          targetConfig.configPayload
        );
        if (!validationReport.isValid) {
          throw new PublishingError({
            code: ErrorCode.PublishValidationFailed,
            message: 'Config cannot be published because validation failed',
            details: {
              tenant_id: input.tenantId,
              config_id: input.configId,
              errors: validationReport.errors
            }
          });
        }

        if (activeConfig !== null) {
          await trx
            .updateTable('store_configs')
            .set({ status: 'archived' })
            .where('id', '=', activeConfig.id)
            .execute();
        }

        await trx
          .updateTable('store_configs')
          .set({
            status: 'active',
            validation_report: validationReport
          })
          .where('id', '=', targetConfig.id)
          .execute();

        await trx
          .updateTable('tenants')
          .set({ active_config_id: targetConfig.id })
          .where('id', '=', input.tenantId)
          .execute();

        await trx
          .insertInto('publish_history')
          .values({
            id: crypto.randomUUID(),
            tenant_id: input.tenantId,
            action: 'publish',
            from_config_id: activeConfig?.id ?? null,
            to_config_id: targetConfig.id,
            actor_user_id: input.actorUserId,
            result: 'success',
            failure_reason: null,
            created_at: new Date()
          })
          .execute();

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'publish.completed',
          targetType: 'store_config',
          targetId: targetConfig.id,
          before: activeConfig === null ? undefined : toAuditPayload(activeConfig),
          after: {
            ...toAuditPayload(targetConfig),
            status: 'active'
          },
          requestId: toAuditRequestId(input.requestId)
        });

        await outboxWriter.write(trx, {
          eventType: 'Publish.Completed',
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          correlationId: toAuditRequestId(input.requestId),
          payload: {
            tenant_id: input.tenantId,
            config_id: targetConfig.id,
            previous_config_id: activeConfig?.id ?? null
          }
        });

        return {
          configId: targetConfig.id,
          activeConfigId: targetConfig.id,
          previousConfigId: activeConfig?.id ?? null
        };
      });
    }
  };
};
