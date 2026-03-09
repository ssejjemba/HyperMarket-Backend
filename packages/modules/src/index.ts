import type { FastifyInstance } from 'fastify';

import type { ModuleDeps, ModuleLogger } from './types';
import { registerRoutes as registerIdentityAccess } from '../modules/identity-access/src/index';

export type { ModuleDeps } from './types';

export const registerModules = async (server: FastifyInstance, deps: ModuleDeps): Promise<void> => {
  const moduleLogger = (deps.logger as ModuleLogger).child({ scope: 'modules' });

  await registerIdentityAccess(server, {
    ...deps,
    logger: moduleLogger
  });
};
