import type { Kysely } from 'kysely';

import { createAuditWriter, runInTransaction, type DatabaseSchema } from '@hypermarket/core';

import type { TenantSettings } from '../domain/Tenant';
import { createTenantSettingsRepoPg } from '../persistence/TenantSettingsRepoPg';
import type { TenantSettingsPatch } from '../persistence/TenantSettingsRepository';
import { toAuditRequestId } from './auditRequestId';

export type UpdateTenantSettingsInput = {
  tenantId: string;
  actorUserId: string;
  patch: TenantSettingsPatch;
  requestId?: string | undefined;
};

export type UpdateTenantSettingsUseCase = {
  execute(input: UpdateTenantSettingsInput): Promise<TenantSettings>;
};

export type UpdateTenantSettingsUseCaseDeps = {
  db: Kysely<DatabaseSchema>;
};

const toAuditPayload = (settings: TenantSettings): Record<string, unknown> => {
  return {
    tenant_id: settings.tenantId,
    contact_name: settings.contactName,
    contact_email: settings.contactEmail,
    contact_phone: settings.contactPhoneE164,
    contact_whatsapp: settings.contactWhatsappE164,
    social_links: settings.socialLinks,
    business_hours: settings.businessHours
  };
};

export const createUpdateTenantSettingsUseCase = (
  deps: UpdateTenantSettingsUseCaseDeps
): UpdateTenantSettingsUseCase => {
  const auditWriter = createAuditWriter();

  return {
    async execute(input) {
      return runInTransaction(deps.db, async (trx) => {
        const settingsRepo = createTenantSettingsRepoPg(trx);
        const before = await settingsRepo.getSettings(input.tenantId);
        const after = await settingsRepo.upsertSettings(input.tenantId, input.patch);

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'tenant.settings.updated',
          targetType: 'tenant_settings',
          targetId: input.tenantId,
          before: toAuditPayload(before),
          after: toAuditPayload(after),
          requestId: toAuditRequestId(input.requestId)
        });

        return after;
      });
    }
  };
};
