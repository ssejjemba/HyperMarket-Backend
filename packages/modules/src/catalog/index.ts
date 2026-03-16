import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import { createMembershipReaderPg } from '../tenancy/persistence/TenancyMembershipReaderPg';
import { createTenantRepoPg } from '../tenancy/persistence/TenantRepoPg';
import { createCatalogRevalidationPlanner } from './application/RevalidationPlanner';
import { createCatalogUseCases } from './application/useCases';
import { registerCatalogApiRoutes } from './api/routes';

export type ReturnTypeCatalogUseCases = ReturnType<typeof createCatalogUseCases>;

export const registerCatalogRoutes = async (
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
  const tenantRepo = createTenantRepoPg(deps.db);
  const useCases = createCatalogUseCases({
    db: deps.db,
    revalidationPlanner: createCatalogRevalidationPlanner()
  });

  await registerCatalogApiRoutes(server, {
    logger: deps.logger,
    sessionService,
    membershipReader,
    tenantRepo,
    useCases
  });
};

export { CatalogError } from './errors/CatalogError';
export type { CatalogErrorCode } from './errors/CatalogError';
export { CatalogSlug, InventoryPolicy, UgxMoney } from './domain';
export { createCatalogRevalidationPlanner } from './application/RevalidationPlanner';
export type {
  CatalogRevalidationPlan,
  CatalogRevalidationPlanner
} from './application/RevalidationPlanner';
export { createCatalogUseCases } from './application/useCases';
export { createCatalogRepoPg } from './persistence/CatalogRepoPg';
export type {
  CatalogCategoryRecord,
  CatalogProductRecord,
  CatalogStatus,
  CatalogVariantRecord
} from './persistence/CatalogRepoPg';
