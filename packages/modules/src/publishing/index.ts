import type { FastifyInstance } from 'fastify';

import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import { createMembershipReaderPg } from '../tenancy/persistence/TenancyMembershipReaderPg';
import type { ModuleDeps } from '../types';
import { registerPublishingApiRoutes } from './api/routes';

export const registerPublishingRoutes = async (
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

  await registerPublishingApiRoutes(server, {
    logger: deps.logger,
    sessionService,
    membershipReader
  });
};

export { registerPublishingApiRoutes } from './api/routes';
export { PublishingError } from './errors/PublishingError';
export type { PublishingErrorCode } from './errors/PublishingError';
