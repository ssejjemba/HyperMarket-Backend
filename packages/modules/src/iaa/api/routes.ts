import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import type { MembershipReader } from '../membership/MembershipReader';
import type { IaaMetrics } from '../observability/iaaMetrics';
import type { RequestOtpUseCase } from '../otp/application/RequestOtpUseCase';
import type { VerifyOtpUseCase } from '../otp/application/VerifyOtpUseCase';
import type { SessionService } from '../session/SessionService';
import { makeGetSessionHandler } from './controllers/getSessionController';
import { makeRequestOtpHandler } from './controllers/requestOtpController';
import { makeVerifyOtpHandler } from './controllers/verifyOtpController';

// ---------------------------------------------------------------------------
// Deps — pre-built use cases and services injected at composition time
// ---------------------------------------------------------------------------

export type IaaApiDeps = {
  logger: BaseLogger;
  requestOtpUseCase: RequestOtpUseCase;
  verifyOtpUseCase: VerifyOtpUseCase;
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

  server.get(
    '/auth/session',
    makeGetSessionHandler(deps.sessionService, deps.membershipReader, deps.metrics)
  );
};
