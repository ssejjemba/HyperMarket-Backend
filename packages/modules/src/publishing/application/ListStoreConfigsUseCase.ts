import type { Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { StoreConfig } from '../domain';
import { createStoreConfigRepoPg } from '../persistence';

export type ListStoreConfigsUseCase = {
  execute(tenantId: string): Promise<StoreConfig[]>;
};

export const createListStoreConfigsUseCase = (
  db: Kysely<DatabaseSchema>
): ListStoreConfigsUseCase => ({
  execute: async (tenantId) => createStoreConfigRepoPg(db).listConfigs(tenantId)
});
