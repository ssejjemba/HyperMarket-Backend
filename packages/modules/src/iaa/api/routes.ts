import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import type { MembershipReader } from '../membership/MembershipReader';
import type { IaaMetrics } from '../observability/iaaMetrics';
import type { RequestOtpUseCase } from '../otp/application/RequestOtpUseCase';
import type { VerifyOtpUseCase } from '../otp/application/VerifyOtpUseCase';
import type { LogoutAllUseCase } from '../session/application/LogoutAllUseCase';
import type { LogoutUseCase } from '../session/application/LogoutUseCase';
import type { SessionService } from '../session/SessionService';
import { makeGetSessionHandler } from './controllers/getSessionController';
import { makeLogoutAllHandler } from './controllers/logoutAllController';
import { makeLogoutHandler } from './controllers/logoutController';
import { makeRequestOtpHandler } from './controllers/requestOtpController';
import { makeVerifyOtpHandler } from './controllers/verifyOtpController';

// ---------------------------------------------------------------------------
// Deps — pre-built use cases and services injected at composition time
// ---------------------------------------------------------------------------

export type IaaApiDeps = {
  logger: BaseLogger;
  requestOtpUseCase: RequestOtpUseCase;
  verifyOtpUseCase: VerifyOtpUseCase;
  logoutUseCase: LogoutUseCase;
  logoutAllUseCase: LogoutAllUseCase;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  metrics?: IaaMetrics | undefined;
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerIaaApiRoutes = async (
  server: FastifyInstance,
  deps: IaaApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'iaa' }, 'registering IAA routes');

  server.post('/auth/otp/request', makeRequestOtpHandler(deps.requestOtpUseCase));

  server.post('/auth/otp/verify', makeVerifyOtpHandler(deps.verifyOtpUseCase));

  server.post('/auth/logout', makeLogoutHandler(deps.logoutUseCase));

  server.post('/auth/logout-all', makeLogoutAllHandler(deps.logoutAllUseCase));

  server.get(
    '/auth/session',
    makeGetSessionHandler(deps.sessionService, deps.membershipReader, deps.metrics)
  );
};
