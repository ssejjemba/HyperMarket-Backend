import type { Kysely } from 'kysely';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';

import type { TemplateRegistry } from '../../templates';
import { PublishingError } from '../errors/PublishingError';
import { createStoreConfigRepoPg, type StoreConfig } from '../persistence';
import type { ValidationReport } from '../domain';

export type CreateDraftConfigInput = {
  tenantId: string;
  actorUserId: string;
  templateId: string;
  templateVersion: string;
  configPayload?: Record<string, unknown>;
  requestId?: string | undefined;
};

export type CreateDraftConfigUseCase = {
  execute(input: CreateDraftConfigInput): Promise<StoreConfig>;
};

export type CreateDraftConfigUseCaseDeps = {
  db: Kysely<DatabaseSchema>;
  templateRegistry: TemplateRegistry;
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

export const createCreateDraftConfigUseCase = (
  deps: CreateDraftConfigUseCaseDeps
): CreateDraftConfigUseCase => {
  const auditWriter = createAuditWriter();

  return {
    async execute(input) {
      const version = deps.templateRegistry.getVersion(input.templateId, input.templateVersion);
      const configPayload = input.configPayload ?? structuredClone(version.defaultConfigPayload);
      const validationReport = deps.configValidator.validate(
        input.templateId,
        input.templateVersion,
        configPayload
      );

      if (!validationReport.isValid) {
        throw new PublishingError({
          code: ErrorCode.ConfigInvalidPayload,
          message: 'Config payload is invalid',
          details: {
            template_id: input.templateId,
            template_version: input.templateVersion,
            errors: validationReport.errors
          }
        });
      }

      return runInTransaction(deps.db, async (trx) => {
        const repo = createStoreConfigRepoPg(trx);
        const config = await repo.createDraftConfig({
          tenantId: input.tenantId,
          templateId: input.templateId,
          templateVersion: input.templateVersion,
          configPayload,
          validationReport,
          createdByUserId: input.actorUserId
        });

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'config.draft.created',
          targetType: 'store_config',
          targetId: config.id,
          after: toAuditPayload(config),
          requestId: input.requestId
        });

        return config;
      });
    }
  };
};
