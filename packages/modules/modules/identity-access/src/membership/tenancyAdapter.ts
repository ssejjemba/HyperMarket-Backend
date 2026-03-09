import type { Kysely } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';
import { createTenancyRepository } from '@hypermarket/modules/tenancy';

export const createMembershipAdapter = (db: Kysely<DatabaseSchema>) => {
  const repo = createTenancyRepository(db);

  const listTenantsForUser = async (userId: string) => repo.listTenantsForUser(userId);

  return {
    listTenantsForUser
  };
};
