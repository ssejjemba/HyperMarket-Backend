import type { FastifyRequest } from 'fastify';

import type { GetStoreConfigUseCase } from '../../application';
import { parseTenantConfigParams } from '../schemas/publishingSchemas';

export type StoreConfigResponse = {
  config: {
    id: string;
    tenant_id: string;
    status: 'draft' | 'active' | 'archived';
    template_id: string;
    template_version: string;
    config_version: number;
    config_payload: Record<string, unknown>;
    validation_report: {
      isValid: boolean;
      errors: Array<{ path: string; code: string; message: string }>;
    } | null;
    created_by_user_id: string;
    created_at: string;
  };
};

export const makeGetStoreConfigHandler =
  (useCase: GetStoreConfigUseCase) =>
  async (request: FastifyRequest): Promise<StoreConfigResponse> => {
    const tenantId = request.tenant?.tenantId;
    if (tenantId === undefined) {
      throw new Error('tenant context is required');
    }

    const { configId } = parseTenantConfigParams(request.params);
    const config = await useCase.execute(tenantId, configId);

    return {
      config: {
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
      }
    };
  };
