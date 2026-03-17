import type { PublishConfigUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';
import { parseActivateConfigRequest } from '../schemas/publishingSchemas';

export type PublishConfigResponse = {
  publish: {
    config_id: string;
    active_config_id: string;
    previous_config_id: string | null;
  };
};

export const makePublishConfigHandler =
  (useCase: PublishConfigUseCase) =>
  async (request: ModuleRequest): Promise<PublishConfigResponse> => {
    const tenantId = request.tenant?.tenantId;
    const userId = request.auth?.userId;
    if (tenantId === undefined || userId === undefined) {
      throw new Error('tenant and auth context are required');
    }

    const body = parseActivateConfigRequest(request.body);
    const result = await useCase.execute({
      tenantId,
      configId: body.config_id,
      actorUserId: userId,
      requestId: request.id
    });

    return {
      publish: {
        config_id: result.configId,
        active_config_id: result.activeConfigId,
        previous_config_id: result.previousConfigId
      }
    };
  };
