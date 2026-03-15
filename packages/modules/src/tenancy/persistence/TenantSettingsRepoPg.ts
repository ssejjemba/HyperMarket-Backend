import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { TenantSettingsPatch, TenantSettingsRepository } from './TenantSettingsRepository';
import { mapTenantSettingsRow } from './mappers';

export const createTenantSettingsRepoPg = (
  db: Kysely<DatabaseSchema>
): TenantSettingsRepository => {
  const getSettings = async (tenantId: string) => {
    const row = await db
      .selectFrom('tenant_settings')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (row === undefined) {
      const now = new Date();
      return {
        tenantId,
        contactName: null,
        contactEmail: null,
        contactPhoneE164: null,
        contactWhatsappE164: null,
        socialLinks: {},
        businessHours: {},
        createdAt: now,
        updatedAt: now
      };
    }

    return mapTenantSettingsRow(row);
  };

  const upsertSettings = async (tenantId: string, patch: TenantSettingsPatch) => {
    const row = await db
      .insertInto('tenant_settings')
      .values({
        tenant_id: tenantId,
        contact_name: patch.contactName ?? null,
        contact_email: patch.contactEmail ?? null,
        contact_phone_e164: patch.contactPhoneE164 ?? null,
        contact_whatsapp_e164: patch.contactWhatsappE164 ?? null,
        social_links: patch.socialLinks ?? {},
        business_hours: patch.businessHours ?? {},
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .onConflict((oc) =>
        oc.column('tenant_id').doUpdateSet({
          contact_name: patch.contactName ?? sql`tenant_settings.contact_name`,
          contact_email: patch.contactEmail ?? sql`tenant_settings.contact_email`,
          contact_phone_e164: patch.contactPhoneE164 ?? sql`tenant_settings.contact_phone_e164`,
          contact_whatsapp_e164:
            patch.contactWhatsappE164 ?? sql`tenant_settings.contact_whatsapp_e164`,
          social_links: patch.socialLinks ?? sql`tenant_settings.social_links`,
          business_hours: patch.businessHours ?? sql`tenant_settings.business_hours`,
          updated_at: sql`now()`
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapTenantSettingsRow(row);
  };

  return {
    getSettings,
    upsertSettings
  };
};
