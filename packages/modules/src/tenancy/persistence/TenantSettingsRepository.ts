import type { TenantSettings } from '../domain/Tenant';

export type TenantSettingsPatch = Partial<{
  contactName: string | null;
  contactEmail: string | null;
  contactPhoneE164: string | null;
  socialLinks: Record<string, unknown>;
  businessHours: Record<string, unknown>;
}>;

export interface TenantSettingsRepository {
  getSettings(tenantId: string): Promise<TenantSettings>;
  upsertSettings(tenantId: string, patch: TenantSettingsPatch): Promise<TenantSettings>;
}
