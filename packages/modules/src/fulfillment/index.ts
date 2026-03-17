import type { FastifyInstance } from 'fastify';

import type { ModuleDeps } from '../types';
import { createSessionRepoPg } from '../iaa/session/persistence/SessionRepoPg';
import { createSessionService } from '../iaa/session/SessionService';
import { createTokenSigner } from '../iaa/session/TokenSigner';
import { createMembershipReaderPg } from '../tenancy/persistence/TenancyMembershipReaderPg';
import { createTenantRepoPg } from '../tenancy/persistence/TenantRepoPg';
import { registerFulfillmentApiRoutes } from './api/routes';
import { createFulfillmentUseCases } from './application/useCases';

export const registerFulfillmentRoutes = async (
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
  const useCases = createFulfillmentUseCases({
    db: deps.db
  });

  await registerFulfillmentApiRoutes(server, {
    logger: deps.logger,
    sessionService,
    membershipReader,
    tenantRepo,
    useCases
  });
};

export {
  assertBusinessHours,
  assertDeliveryZoneInput,
  assertFulfillmentModes,
  BUSINESS_DAY_KEYS,
  calculateDeliveryFee,
  isStoreOpen,
  validateFulfillmentSelection
} from './domain';
export type {
  BusinessDayKey,
  BusinessHours,
  BusinessHoursDay,
  BusinessOpenReason,
  DeliveryZone,
  FulfillmentPolicy,
  FulfillmentSelection,
  FulfillmentSettings
} from './domain';
export { FulfillmentError } from './errors/FulfillmentError';
export type { FulfillmentErrorCode } from './errors/FulfillmentError';
export { registerFulfillmentApiRoutes } from './api/routes';
export { createFulfillmentUseCases, createFulfillmentPolicyReaderPg } from './application/useCases';
export { createFulfillmentRepoPg } from './persistence/FulfillmentRepoPg';
export type {
  DeliveryZoneRecord,
  FulfillmentSettingsRecord
} from './persistence/FulfillmentRepoPg';
