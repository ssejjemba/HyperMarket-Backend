import type { FastifyInstance } from 'fastify';

import type { ModuleDeps, ModuleLogger } from './types';
import { registerIaaRoutes } from './iaa/index';
import { registerCatalogRoutes } from './catalog/index';
import { registerFulfillmentRoutes } from './fulfillment/index';
import { registerMediaRoutes } from './media/index';
import { registerOrderRoutes } from './orders/index';
import { registerOpsRoutes } from './ops/index';
import { registerPaymentRoutes } from './payments/index';
import { registerPublishingRoutes } from './publishing/index';
import { registerTenancyRoutes } from './tenancy/index';
import { registerTemplateRoutes } from './templates/index';

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

  await registerCatalogRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerFulfillmentRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerOrderRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerOpsRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerPaymentRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerMediaRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerTemplateRoutes(server, {
    ...deps,
    logger: moduleLogger
  });

  await registerPublishingRoutes(server, {
    ...deps,
    logger: moduleLogger
  });
};

export { NotificationError } from './notifications/index';
export type { NotificationErrorCode } from './notifications/index';
