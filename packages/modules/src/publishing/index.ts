import type { FastifyInstance } from 'fastify';

import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import { createMembershipReaderPg } from '../tenancy/persistence/TenancyMembershipReaderPg';
import { createTemplateRegistry } from '../templates';
import type { ModuleDeps } from '../types';
import { createConfigValidator } from './application';
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
  const templateRegistry = createTemplateRegistry();
  const configValidator = createConfigValidator(templateRegistry);

  await registerPublishingApiRoutes(server, {
    db: deps.db,
    logger: deps.logger,
    sessionService,
    membershipReader,
    configValidator
  });
};

export { registerPublishingApiRoutes } from './api/routes';
export { createConfigValidator } from './application';
export type { ConfigValidator } from './application';
export { createPublishConfigUseCase } from './application';
export type { PublishConfigInput, PublishConfigOutput, PublishConfigUseCase } from './application';
export { createRollbackConfigUseCase } from './application';
export type {
  RollbackConfigInput,
  RollbackConfigOutput,
  RollbackConfigUseCase
} from './application';
export { createStoreConfigRepoPg } from './persistence';
export type {
  CreateDraftConfigInput,
  StoreConfig,
  StoreConfigRepository,
  UpdateDraftConfigInput
} from './persistence';
export { PublishingError } from './errors/PublishingError';
export type { PublishingErrorCode } from './errors/PublishingError';
