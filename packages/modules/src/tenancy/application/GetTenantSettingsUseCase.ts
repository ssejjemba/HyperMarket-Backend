import type { TenantSettings } from '../domain/Tenant';
import type { TenantSettingsRepository } from '../persistence/TenantSettingsRepository';

export type GetTenantSettingsUseCase = {
  execute(tenantId: string): Promise<TenantSettings>;
};

export type GetTenantSettingsUseCaseDeps = {
  settingsRepo: TenantSettingsRepository;
};

export const createGetTenantSettingsUseCase = (
  deps: GetTenantSettingsUseCaseDeps
): GetTenantSettingsUseCase => {
  return {
    execute(tenantId) {
      return deps.settingsRepo.getSettings(tenantId);
    }
  };
};
