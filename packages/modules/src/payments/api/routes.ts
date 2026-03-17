import type { FastifyInstance } from 'fastify';
import type { BaseLogger } from 'pino';

import { AppError, ErrorCode } from '@hypermarket/contracts';

import type { StorefrontRateLimiter } from '../../rateLimit/RedisStorefrontRateLimiter';
import type { TenantRepository } from '../../tenancy/persistence/TenantRepository';
import type { createPaymentUseCases } from '../application/useCases';
import { mapPaymentIntentDto } from './controllers/mappers';
import {
  createPaymentIntentBodySchema,
  parsePaymentValidation,
  storefrontTenantParamsSchema,
  webhookProviderParamsSchema
} from './schemas/paymentSchemas';

export type PaymentsApiDeps = {
  logger: BaseLogger;
  tenantRepo: TenantRepository;
  useCases: ReturnType<typeof createPaymentUseCases>;
  storefrontRateLimiter?: StorefrontRateLimiter | undefined;
};

const resolveTenantIdBySlug = async (
  tenantRepo: TenantRepository,
  tenantSlug: string
): Promise<string> => {
  const tenant = await tenantRepo.findBySlug(tenantSlug);
  if (tenant === null) {
    throw new AppError({
      code: ErrorCode.TenantResolutionFailed,
      message: 'Tenant not found'
    });
  }

  return tenant.id;
};

const getIdempotencyKey = (headers: Record<string, string | string[] | undefined>): string => {
  const header = headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;

  if (value === undefined || value.trim().length === 0) {
    throw new AppError({
      code: ErrorCode.PaymentProviderConfigInvalid,
      message: 'Idempotency-Key header is required'
    });
  }

  return value.trim();
};

export const registerPaymentApiRoutes = async (
  server: FastifyInstance,
  deps: PaymentsApiDeps
): Promise<void> => {
  deps.logger.info({ module: 'payments' }, 'registering PAY routes');

  server.post('/storefront/:tenantSlug/payments/intents', async (request, reply) => {
    const params = parsePaymentValidation(storefrontTenantParamsSchema.safeParse(request.params));
    const body = parsePaymentValidation(createPaymentIntentBodySchema.safeParse(request.body));
    const tenantId = await resolveTenantIdBySlug(deps.tenantRepo, params.tenantSlug);

    if (deps.storefrontRateLimiter !== undefined) {
      const decision = await deps.storefrontRateLimiter.check(`${tenantId}:${request.ip}`);
      if (!decision.allowed) {
        reply.header('Retry-After', String(decision.retryAfterSeconds));
        throw new AppError({
          code: ErrorCode.RateLimited,
          message: 'Too many payment initiation requests',
          details: {
            retry_after_seconds: decision.retryAfterSeconds
          }
        });
      }
    }

    const intent = await deps.useCases.createIntent({
      tenantId,
      orderId: body.order_id,
      idempotencyKey: getIdempotencyKey(request.headers),
      method: 'mobile_money',
      customerPhoneE164: body.customer_phone_e164,
      customerEmail: body.email,
      network: body.network,
      ...(body.provider !== undefined ? { provider: body.provider } : {}),
      requestId: request.id
    });

    return {
      intent: mapPaymentIntentDto(intent)
    };
  });

  server.post('/payments/webhooks/:provider', async (request, reply) => {
    const params = parsePaymentValidation(webhookProviderParamsSchema.safeParse(request.params));
    const result = await deps.useCases.processWebhook({
      providerName: params.provider,
      request: {
        headers: request.headers,
        body: request.body
      },
      requestId: request.id
    });

    reply.status(200);
    return {
      ok: true,
      duplicate: result.duplicate
    };
  });
};
