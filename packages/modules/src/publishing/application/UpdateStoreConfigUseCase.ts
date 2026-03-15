import type { Kysely } from 'kysely';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';

import type { StoreConfig, ValidationReport } from '../domain';
import { PublishingError } from '../errors/PublishingError';
import { createStoreConfigRepoPg } from '../persistence';

export type UpdateStoreConfigInput = {
  tenantId: string;
  configId: string;
  actorUserId: string;
  configPayload: Record<string, unknown>;
  requestId?: string | undefined;
};

export type UpdateStoreConfigUseCase = {
  execute(input: UpdateStoreConfigInput): Promise<StoreConfig>;
};

export type UpdateStoreConfigUseCaseDeps = {
  db: Kysely<DatabaseSchema>;
  configValidator: {
    validate(templateId: string, templateVersion: string, payload: unknown): ValidationReport;
  };
};

const toAuditPayload = (config: StoreConfig): Record<string, unknown> => ({
  id: config.id,
  tenant_id: config.tenantId,
  status: config.status,
  template_id: config.templateId,
  template_version: config.templateVersion,
  config_version: config.configVersion,
  config_payload: config.configPayload,
  validation_report: config.validationReport,
  created_by_user_id: config.createdByUserId,
  created_at: config.createdAt.toISOString()
});

export const createUpdateStoreConfigUseCase = (
  deps: UpdateStoreConfigUseCaseDeps
): UpdateStoreConfigUseCase => {
  const auditWriter = createAuditWriter();

  return {
    async execute(input) {
      return runInTransaction(deps.db, async (trx) => {
        const repo = createStoreConfigRepoPg(trx);
        const before = await repo.getConfigById(input.tenantId, input.configId);
        if (before === null) {
          throw new PublishingError({
            code: ErrorCode.ConfigNotFound,
            message: 'Config not found',
            details: {
              tenant_id: input.tenantId,
              config_id: input.configId
            }
          });
        }

        const validationReport = deps.configValidator.validate(
          before.templateId,
          before.templateVersion,
          input.configPayload
        );
        if (!validationReport.isValid) {
          throw new PublishingError({
            code: ErrorCode.ConfigInvalidPayload,
            message: 'Config payload is invalid',
            details: {
              template_id: before.templateId,
              template_version: before.templateVersion,
              errors: validationReport.errors
            }
          });
        }

        const after = await repo.updateDraftConfig({
          tenantId: input.tenantId,
          configId: input.configId,
          configPayload: input.configPayload,
          validationReport
        });

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'config.updated',
          targetType: 'store_config',
          targetId: after.id,
          before: toAuditPayload(before),
          after: toAuditPayload(after),
          requestId: input.requestId
        });

        return after;
      });
    }
  };
};
