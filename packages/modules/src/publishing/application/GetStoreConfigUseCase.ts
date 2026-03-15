import type { Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';

import type { StoreConfig } from '../domain';
import { PublishingError } from '../errors/PublishingError';
import { createStoreConfigRepoPg } from '../persistence';

export type GetStoreConfigUseCase = {
  execute(tenantId: string, configId: string): Promise<StoreConfig>;
};

export const createGetStoreConfigUseCase = (db: Kysely<DatabaseSchema>): GetStoreConfigUseCase => ({
  execute: async (tenantId, configId) => {
    const config = await createStoreConfigRepoPg(db).getConfigById(tenantId, configId);
    if (config === null) {
      throw new PublishingError({
        code: ErrorCode.ConfigNotFound,
        message: 'Config not found',
        details: {
          tenant_id: tenantId,
          config_id: configId
        }
      });
    }

    return config;
  }
});
