import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';
import { requireTenantMembership, requireTenantOwner } from '@hypermarket/core/http';

import { extractBearerToken } from '../../iaa/api/controllers/extractBearerToken';
import type { SessionService } from '../../iaa/session/SessionService';
import type { MembershipReader } from '../../tenancy/MembershipReader';
import type { ModuleRequest } from '../../types';
import type { createOpsRepoPg } from '../persistence/OpsRepoPg';
import type { createOpsQueueClient } from '../runtime/OpsQueueClient';
import {
  parseDlqReplayParams,
  parseDlqTargetParams,
  parseLimitQuery,
  parseNotificationJobParams,
  parseNotificationQuery,
  parseOutboxQuery,
  parsePaymentQuery,
  parseTenantIdParams
} from './schemas/opsSchemas';

export type OpsApiDeps = {
  logger: BaseLogger;
  sessionService: SessionService;
  membershipReader: MembershipReader;
  repo: ReturnType<typeof createOpsRepoPg>;
  queues: ReturnType<typeof createOpsQueueClient>;
};

const getTenantId = (request: ModuleRequest): string => {
  const tenantId = request.tenant?.tenantId;
  if (tenantId === undefined) {
    throw new Error('tenant context is required');
  }

  return tenantId;
};

export const registerOpsApiRoutes = async (
  server: FastifyInstance,
  deps: OpsApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'ops' }, 'registering OPS routes');

  const tenantGuard = requireTenantMembership({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });
  const tenantOwnerGuard = requireTenantOwner({
    getAuth: async (request) => deps.sessionService.validateSession(extractBearerToken(request)),
    assertMembership: async (userId, tenantId) =>
      deps.membershipReader.assertMembership(userId, tenantId)
  });

  server.get('/tenants/:tenantId/ops/summary', { preHandler: tenantGuard }, async (request) => {
    parseTenantIdParams(request.params);
    return deps.repo.getSummary(getTenantId(request));
  });

  server.get('/tenants/:tenantId/ops/outbox', { preHandler: tenantGuard }, async (request) => {
    parseTenantIdParams(request.params);
    const query = parseOutboxQuery(request.query);
    const events = await deps.repo.listOutboxEvents({
      tenantId: getTenantId(request),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.event_type !== undefined ? { eventType: query.event_type } : {}),
      limit: query.limit ?? 20
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        event_type: event.event_type,
        tenant_id: event.tenant_id,
        correlation_id: event.correlation_id,
        actor_user_id: event.actor_user_id,
        payload: event.payload,
        occurred_at: event.occurred_at.toISOString(),
        available_at: event.available_at.toISOString(),
        dispatched_at: event.dispatched_at?.toISOString() ?? null,
        attempts: event.attempts,
        last_error: event.last_error,
        created_at: event.created_at.toISOString()
      }))
    };
  });

  server.get('/tenants/:tenantId/ops/payments', { preHandler: tenantGuard }, async (request) => {
    parseTenantIdParams(request.params);
    const query = parsePaymentQuery(request.query);
    const intents = await deps.repo.listPaymentIntents({
      tenantId: getTenantId(request),
      ...(query.status !== undefined ? { status: query.status } : {}),
      limit: query.limit ?? 20
    });

    return {
      intents: intents.map((intent) => ({
        id: intent.id,
        order_id: intent.order_id,
        provider: intent.provider,
        method: intent.method,
        status: intent.status,
        amount: intent.amount,
        currency: intent.currency,
        tx_ref: intent.tx_ref,
        provider_reference: intent.provider_reference,
        provider_transaction_id: intent.provider_transaction_id,
        customer_phone_e164: intent.customer_phone_e164,
        customer_email: intent.customer_email,
        network: intent.network,
        failure_code: intent.failure_code,
        failure_message: intent.failure_message,
        created_at: intent.created_at.toISOString(),
        updated_at: intent.updated_at.toISOString()
      }))
    };
  });

  server.get(
    '/tenants/:tenantId/ops/notifications',
    { preHandler: tenantGuard },
    async (request) => {
      parseTenantIdParams(request.params);
      const query = parseNotificationQuery(request.query);
      const jobs = await deps.repo.listNotificationJobs({
        tenantId: getTenantId(request),
        ...(query.status !== undefined ? { status: query.status } : {}),
        limit: query.limit ?? 20
      });

      return {
        jobs: jobs.map((job) => ({
          id: job.id,
          event_id: job.event_id,
          event_type: job.event_type,
          channel: job.channel,
          recipient: job.recipient,
          template_id: job.template_id,
          template_version: job.template_version,
          payload: job.payload,
          status: job.status,
          attempt_count: job.attempt_count,
          last_error_code: job.last_error_code,
          last_error_message: job.last_error_message,
          provider: job.provider,
          provider_message_id: job.provider_message_id,
          created_at: job.created_at.toISOString(),
          updated_at: job.updated_at.toISOString()
        }))
      };
    }
  );

  server.get(
    '/tenants/:tenantId/ops/notifications/:jobId/attempts',
    { preHandler: tenantGuard },
    async (request) => {
      const params = parseNotificationJobParams(request.params);
      const existing = await deps.repo.getNotificationJob(getTenantId(request), params.jobId);
      if (existing === null) {
        throw new AppError({
          code: ErrorCode.NotJobNotFound,
          message: 'Notification job not found'
        });
      }

      const query = parseLimitQuery(request.query);
      const attempts = await deps.repo.listNotificationAttempts({
        tenantId: getTenantId(request),
        jobId: params.jobId,
        limit: query.limit ?? 20
      });

      return {
        attempts: attempts.map((attempt) => ({
          id: attempt.id,
          job_id: attempt.job_id,
          attempt_number: attempt.attempt_number,
          provider: attempt.provider,
          result: attempt.result,
          error_code: attempt.error_code,
          error_message: attempt.error_message,
          provider_message_id: attempt.provider_message_id,
          created_at: attempt.created_at.toISOString()
        }))
      };
    }
  );

  server.get('/tenants/:tenantId/ops/dlq/:target', { preHandler: tenantGuard }, async (request) => {
    const params = parseDlqTargetParams(request.params);
    const query = parseLimitQuery(request.query);
    const jobs = await deps.queues.listTenantDlqJobs({
      target: params.target,
      tenantId: getTenantId(request),
      limit: query.limit ?? 20
    });

    return {
      jobs
    };
  });

  server.post(
    '/tenants/:tenantId/ops/dlq/:target/:jobId/replay',
    { preHandler: tenantOwnerGuard },
    async (request) => {
      const params = parseDlqReplayParams(request.params);
      const replay = await deps.queues.replayTenantDlqJob({
        target: params.target,
        tenantId: getTenantId(request),
        jobId: params.jobId
      });

      if (!replay.replayed && replay.reason === 'not_found') {
        throw new AppError({
          code: ErrorCode.NotFound,
          message: 'DLQ job not found'
        });
      }

      if (!replay.replayed && replay.reason === 'tenant_mismatch') {
        throw new AppError({
          code: ErrorCode.TenantAccessForbidden,
          message: 'DLQ job does not belong to tenant'
        });
      }

      return {
        replayed: true
      };
    }
  );
};
