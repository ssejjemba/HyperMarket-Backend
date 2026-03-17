import type { ListStoreConfigsUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';

export type ListStoreConfigsResponse = {
  configs: Array<{
    id: string;
    tenant_id: string;
    status: 'draft' | 'active' | 'archived';
    template_id: string;
    template_version: string;
    config_version: number;
    validation_report: {
      isValid: boolean;
      errors: Array<{ path: string; code: string; message: string }>;
    } | null;
    created_by_user_id: string;
    created_at: string;
  }>;
};

export const makeListStoreConfigsHandler =
  (useCase: ListStoreConfigsUseCase) =>
  async (request: ModuleRequest): Promise<ListStoreConfigsResponse> => {
    const tenantId = request.tenant?.tenantId;
    if (tenantId === undefined) {
      throw new Error('tenant context is required');
    }

    const configs = await useCase.execute(tenantId);

    return {
      configs: configs.map((config) => ({
        id: config.id,
        tenant_id: config.tenantId,
        status: config.status,
        template_id: config.templateId,
        template_version: config.templateVersion,
        config_version: config.configVersion,
        validation_report: config.validationReport,
        created_by_user_id: config.createdByUserId,
        created_at: config.createdAt.toISOString()
      }))
    };
  };
