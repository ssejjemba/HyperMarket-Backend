import type { RollbackConfigUseCase } from '../../application';
import type { ModuleRequest } from '../../../types';
import { parseActivateConfigRequest } from '../schemas/publishingSchemas';

export type RollbackConfigResponse = {
  rollback: {
    config_id: string;
    active_config_id: string;
    previous_config_id: string | null;
  };
};

export const makeRollbackConfigHandler =
  (useCase: RollbackConfigUseCase) =>
  async (request: ModuleRequest): Promise<RollbackConfigResponse> => {
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
      rollback: {
        config_id: result.configId,
        active_config_id: result.activeConfigId,
        previous_config_id: result.previousConfigId
      }
    };
  };
