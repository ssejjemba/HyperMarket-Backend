import type { FastifyRequest } from 'fastify';

import type { UpdateStoreConfigUseCase } from '../../application';
import { parseTenantConfigParams, parseUpdateConfigRequest } from '../schemas/publishingSchemas';
import type { StoreConfigResponse } from './getStoreConfigController';
import { mapStoreConfigResponse } from './createStoreConfigController';

export const makeUpdateStoreConfigHandler =
  (useCase: UpdateStoreConfigUseCase) =>
  async (request: FastifyRequest): Promise<StoreConfigResponse> => {
    const tenantId = request.tenant?.tenantId;
    const userId = request.auth?.userId;
    if (tenantId === undefined || userId === undefined) {
      throw new Error('tenant and auth context are required');
    }

    const { configId } = parseTenantConfigParams(request.params);
    const body = parseUpdateConfigRequest(request.body);
    const config = await useCase.execute({
      tenantId,
      configId,
      actorUserId: userId,
      configPayload: body.config_payload,
      requestId: request.id
    });

    return mapStoreConfigResponse(config);
  };
