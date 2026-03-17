import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import { createMembershipReaderPg } from '../tenancy/persistence/TenancyMembershipReaderPg';
import { registerOpsApiRoutes } from './api/routes';
import { createOpsRepoPg } from './persistence/OpsRepoPg';
import { createOpsQueueClient } from './runtime/OpsQueueClient';

export const registerOpsRoutes = async (
  server: FastifyInstance,
  deps: ModuleDeps
): Promise<void> => {
  const sessionRepo = createSessionRepoPg(deps.db);
  const tokenSigner = createTokenSigner({
    secret: deps.config.jwtSecret,
    ttlSeconds: deps.config.sessionTtlSeconds,
    issuer: deps.config.jwtIssuer
  });
  const sessionService = createSessionService({
    signer: tokenSigner,
    repo: sessionRepo,
    ttlSeconds: deps.config.sessionTtlSeconds
  });
  const membershipReader = createMembershipReaderPg(deps.db);
  const queues = createOpsQueueClient(deps.config.redisUrl);

  server.addHook('onClose', async () => {
    await queues.close();
  });

  await registerOpsApiRoutes(server, {
    logger: deps.logger,
    sessionService,
    membershipReader,
    repo: createOpsRepoPg(deps.db),
    queues
  });
};

export { createOpsRepoPg } from './persistence/OpsRepoPg';
export { createOpsQueueClient } from './runtime/OpsQueueClient';
