import type { CreateDraftConfigUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';
import { parseCreateConfigRequest } from '../schemas/publishingSchemas';
import type { StoreConfigResponse } from './getStoreConfigController';

export const makeCreateStoreConfigHandler =
  (useCase: CreateDraftConfigUseCase) =>
  async (request: ModuleRequest): Promise<StoreConfigResponse> => {
    const tenantId = request.tenant?.tenantId;
    const userId = request.auth?.userId;
    if (tenantId === undefined || userId === undefined) {
      throw new Error('tenant and auth context are required');
    }

    const body = parseCreateConfigRequest(request.body);
    const input = {
      tenantId,
      actorUserId: userId,
      templateId: body.template_id,
      templateVersion: body.template_version,
      requestId: request.id
    };
    const config = await useCase.execute(
      body.config_payload === undefined ? input : { ...input, configPayload: body.config_payload }
    );

    return mapStoreConfigResponse(config);
  };

const mapStoreConfigResponse = (config: {
  id: string;
  tenantId: string;
  status: 'draft' | 'active' | 'archived';
  templateId: string;
  templateVersion: string;
  configVersion: number;
  configPayload: Record<string, unknown>;
  validationReport: {
    isValid: boolean;
    errors: Array<{ path: string; code: string; message: string }>;
  } | null;
  createdByUserId: string;
  createdAt: Date;
}): StoreConfigResponse => ({
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
});

export { mapStoreConfigResponse };
