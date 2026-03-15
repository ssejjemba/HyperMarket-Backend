import type { FastifyInstance } from 'fastify';

import type { ModuleDeps, ModuleLogger } from './types';
import { registerIaaRoutes } from './iaa/index';
import { registerTenancyRoutes } from './tenancy/index';

export type { ModuleDeps } from './types';

export const registerModules = async (server: FastifyInstance, deps: ModuleDeps): Promise<void> => {
  const moduleLogger = (deps.logger as ModuleLogger).child({ scope: 'modules' });

  await registerIaaRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerTenancyRoutes(server, {
    ...deps,
    logger: moduleLogger
  });
};
