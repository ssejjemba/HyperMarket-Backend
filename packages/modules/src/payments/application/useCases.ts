import {
  createAuditWriter,
  createIdempotencyService,
  createOutboxWriter,
  runInTransaction,
  type AppConfigShape,
  type DatabaseSchema
} from '@hypermarket/core';
import { AppError, ErrorCode } from '@hypermarket/contracts';
import type { Kysely } from 'kysely';

import { OrderError, type OrderPaymentPort } from '../../orders';
import { createPaymentRequestHash, CustomerPhone, type PaymentIntentStatus } from '../domain';
import { PaymentError } from '../errors/PaymentError';
import {
  signMockMomoWebhook,
  type PaymentMethod,
  type PaymentProvider,
  type ProviderWebhookHttpRequest
} from '../provider';
import { createPaymentRepoPg } from '../persistence/PaymentRepoPg';
import { createPaymentProviderRegistry } from './providerRegistry';

const CREATE_INTENT_OPERATION = 'create_payment_intent';

const mapIdempotencyError = (error: unknown): never => {
  if (error instanceof AppError && error.code === ErrorCode.IdempotencyConflict) {
    throw new PaymentError({
      code: ErrorCode.PaymentIdempotencyConflict,
      message: 'Idempotency key reuse conflict',
      ...(error.details !== undefined ? { details: error.details } : {}),
      cause: error
    });
  }

  throw error;
};

const mapOrderPortError = (error: unknown): never => {
  if (error instanceof OrderError) {
    if (error.code === ErrorCode.OrderNotFound) {
      throw new PaymentError({
        code: ErrorCode.PaymentOrderNotFound,
        message: 'Order not found',
        cause: error
      });
    }

    if (error.code === ErrorCode.OrderInvalidStateTransition) {
      throw new PaymentError({
        code: ErrorCode.PaymentOrderNotPayable,
        message: 'Order payment transition failed',
        cause: error
      });
    }
  }

  throw error;
};

const mapProviderStatus = (
  status: 'pending' | 'awaiting_customer' | 'succeeded' | 'failed' | 'expired'
): PaymentIntentStatus => {
  switch (status) {
    case 'pending':
      return 'PENDING_PROVIDER';
    case 'awaiting_customer':
      return 'AWAITING_CUSTOMER';
    case 'succeeded':
      return 'SUCCEEDED';
    case 'failed':
      return 'FAILED';
    case 'expired':
      return 'EXPIRED';
  }
};

const isOrderPayable = (status: string, checkoutMode: string): boolean =>
  checkoutMode === 'gateway_payment' && (status === 'PENDING' || status === 'CONFIRMED');

const isFinalIntentStatus = (status: PaymentIntentStatus): boolean =>
  ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(status);

const createdTxRefFallback = (tenantId: string, orderId: string): string =>
  `legacy:${tenantId}:${orderId}`;

export const createPaymentUseCases = (deps: {
  db: Kysely<DatabaseSchema>;
  config: AppConfigShape;
  orderPaymentPort: OrderPaymentPort;
}) => {
  const auditWriter = createAuditWriter();
  const outboxWriter = createOutboxWriter();
  const idempotency = createIdempotencyService();
  const providers = createPaymentProviderRegistry(deps.config);

  const transitionOrderForIntent = async (input: {
    tenantId: string;
    orderId: string;
    intentId: string;
    status: PaymentIntentStatus;
    requestId?: string;
  }): Promise<void> => {
    if (input.status === 'SUCCEEDED') {
      await deps.orderPaymentPort.markOrderPaid({
        tenantId: input.tenantId,
        orderId: input.orderId,
        paymentIntentId: input.intentId,
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {})
      });
      return;
    }

    if (input.status === 'FAILED') {
      await deps.orderPaymentPort.markOrderPaymentFailed({
        tenantId: input.tenantId,
        orderId: input.orderId,
        reason: 'Payment provider marked payment as failed',
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {})
      });
      return;
    }

    if (input.status === 'EXPIRED') {
      await deps.orderPaymentPort.markOrderPaymentExpired({
        tenantId: input.tenantId,
        orderId: input.orderId,
        reason: 'Payment provider marked payment as expired',
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {})
      });
    }
  };

  const applyProviderEvent = async (input: {
    provider: PaymentProvider;
    request: ProviderWebhookHttpRequest;
    requestId?: string;
  }) =>
    runInTransaction(deps.db, async (trx) => {
      const repo = createPaymentRepoPg(trx);
      const event = input.provider.parseWebhook(input.request);
      const intent = await repo.getIntentByProviderReference(
        input.provider.providerName,
        event.providerReference
      );

      if (intent === null) {
        throw new PaymentError({
          code: ErrorCode.PaymentIntentNotFound,
          message: 'Payment intent not found for provider reference'
        });
      }

      const eventRecord = await repo.recordProviderEvent({
        provider: input.provider.providerName,
        providerEventId: event.providerEventId,
        tenantId: intent.tenantId,
        intentId: intent.id,
        orderId: intent.orderId,
        payload: event.payload
      });

      if (eventRecord.duplicate) {
        return {
          duplicate: true,
          intent
        };
      }

      const nextStatus = mapProviderStatus(event.status);
      const updatedIntent =
        intent.status === nextStatus || isFinalIntentStatus(intent.status)
          ? intent
          : await repo.updateIntent({
              tenantId: intent.tenantId,
              intentId: intent.id,
              status: nextStatus
            });

      if (updatedIntent === null) {
        throw new PaymentError({
          code: ErrorCode.PaymentIntentNotFound,
          message: 'Payment intent not found'
        });
      }

      await auditWriter.write(trx, {
        tenantId: intent.tenantId,
        action: 'payment.webhook.processed',
        targetType: 'payment_intent',
        targetId: updatedIntent.id,
        before: {
          status: intent.status
        },
        after: {
          status: updatedIntent.status,
          provider_reference: updatedIntent.providerReference
        },
        requestId: input.requestId
      });

      if (updatedIntent.status !== intent.status) {
        await outboxWriter.write(trx, {
          eventType: updatedIntent.status === 'SUCCEEDED' ? 'Payment.Succeeded' : 'Payment.Failed',
          tenantId: intent.tenantId,
          correlationId: input.requestId,
          payload: {
            tenant_id: intent.tenantId,
            order_id: intent.orderId,
            intent_id: updatedIntent.id,
            provider: updatedIntent.provider,
            provider_reference: updatedIntent.providerReference,
            status: updatedIntent.status
          }
        });
      }

      if (updatedIntent.status !== intent.status) {
        await transitionOrderForIntent({
          tenantId: intent.tenantId,
          orderId: intent.orderId,
          intentId: updatedIntent.id,
          status: updatedIntent.status,
          ...(input.requestId !== undefined ? { requestId: input.requestId } : {})
        });
      }

      return {
        duplicate: false,
        intent: updatedIntent
      };
    });

  return {
    async createIntent(input: {
      tenantId: string;
      orderId: string;
      idempotencyKey: string;
      method: PaymentMethod;
      provider?: string;
      customerPhoneE164?: string | null;
      returnUrl?: string | null;
      requestId?: string;
    }) {
      const providerName = input.provider ?? deps.config.paymentDefaultProvider ?? 'mock_momo';
      const phone =
        input.customerPhoneE164 === undefined || input.customerPhoneE164 === null
          ? null
          : CustomerPhone.parse(input.customerPhoneE164).toE164();
      const requestHash = createPaymentRequestHash({
        tenantId: input.tenantId,
        orderId: input.orderId,
        method: input.method,
        provider: providerName,
        customerPhoneE164: phone,
        ...(input.returnUrl !== undefined ? { returnUrl: input.returnUrl } : {})
      });

      try {
        return await runInTransaction(deps.db, async (trx) => {
          const begin = await idempotency.begin(
            trx,
            input.tenantId,
            CREATE_INTENT_OPERATION,
            input.idempotencyKey,
            requestHash
          );

          const repo = createPaymentRepoPg(trx);

          if (begin.status === 'replay') {
            if (begin.record.responseRef === undefined) {
              throw new PaymentError({
                code: ErrorCode.PaymentIdempotencyConflict,
                message: 'Payment intent creation is already in progress'
              });
            }

            const existing = await repo.getIntentById(input.tenantId, begin.record.responseRef);
            if (existing === null) {
              throw new PaymentError({
                code: ErrorCode.PaymentIntentNotFound,
                message: 'Previously created payment intent could not be found'
              });
            }

            return existing;
          }

          let order;
          try {
            order = await deps.orderPaymentPort.getOrderForPayment(input.tenantId, input.orderId);
          } catch (error) {
            return mapOrderPortError(error);
          }
          if (!isOrderPayable(order.status, order.checkoutMode)) {
            throw new PaymentError({
              code: ErrorCode.PaymentOrderNotPayable,
              message: 'Order is not payable in its current state',
              details: {
                order_status: order.status,
                checkout_mode: order.checkoutMode
              }
            });
          }

          const provider = providers.getProvider(providerName);
          const created = await repo.createIntent({
            tenantId: input.tenantId,
            orderId: input.orderId,
            provider: provider.providerName,
            method: input.method,
            status: 'CREATED',
            amount: order.totalAmount,
            currency: order.currency,
            txRef: createdTxRefFallback(input.tenantId, input.orderId),
            customerEmail: '',
            network: '',
            ...(phone !== null ? { customerPhoneE164: phone } : {})
          });

          const withPending = await repo.updateIntent({
            tenantId: input.tenantId,
            intentId: created.id,
            status: 'PENDING_PROVIDER'
          });
          if (withPending === null) {
            throw new PaymentError({
              code: ErrorCode.PaymentIntentNotFound,
              message: 'Payment intent not found'
            });
          }

          let providerResult;
          try {
            providerResult = await provider.createIntent({
              tenantId: input.tenantId,
              intentId: created.id,
              orderId: input.orderId,
              amount: order.totalAmount,
              currency: order.currency,
              method: input.method,
              customerPhoneE164: phone,
              webhookUrl: `/payments/webhooks/${provider.providerName}`
            });
          } catch (error) {
            throw new PaymentError({
              code: ErrorCode.PaymentProviderUnavailable,
              message: 'Payment provider create intent failed',
              cause: error
            });
          }

          const finalIntent = await repo.updateIntent({
            tenantId: input.tenantId,
            intentId: created.id,
            status: mapProviderStatus(providerResult.status),
            providerReference: providerResult.providerReference
          });

          if (finalIntent === null) {
            throw new PaymentError({
              code: ErrorCode.PaymentIntentNotFound,
              message: 'Payment intent not found'
            });
          }

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            action: 'payment.intent.created',
            targetType: 'payment_intent',
            targetId: finalIntent.id,
            after: {
              order_id: finalIntent.orderId,
              provider: finalIntent.provider,
              status: finalIntent.status
            },
            requestId: input.requestId
          });

          await outboxWriter.write(trx, {
            eventType: 'Payment.IntentCreated',
            tenantId: input.tenantId,
            correlationId: input.requestId,
            payload: {
              tenant_id: input.tenantId,
              order_id: finalIntent.orderId,
              intent_id: finalIntent.id,
              provider: finalIntent.provider,
              status: finalIntent.status
            }
          });

          await idempotency.complete(trx, begin.record.id, finalIntent.id);

          return {
            ...finalIntent,
            nextAction: providerResult.nextAction
          };
        });
      } catch (error) {
        try {
          return mapIdempotencyError(error);
        } catch (mapped) {
          return mapOrderPortError(mapped);
        }
      }
    },

    async processWebhook(input: {
      providerName: string;
      request: ProviderWebhookHttpRequest;
      requestId?: string;
    }) {
      const provider = providers.getProvider(input.providerName);
      provider.verifyWebhookSignature(input.request);
      try {
        return await applyProviderEvent({
          provider,
          request: input.request,
          ...(input.requestId !== undefined ? { requestId: input.requestId } : {})
        });
      } catch (error) {
        return mapOrderPortError(error);
      }
    },

    async reconcileStaleIntents(input?: { limit?: number; staleMinutes?: number }) {
      const staleBefore = new Date(
        Date.now() -
          (input?.staleMinutes ?? deps.config.paymentReconciliationStaleMinutes ?? 10) * 60_000
      );
      const repo = createPaymentRepoPg(deps.db);
      const intents = await repo.listStaleIntents({
        statuses: ['PENDING_PROVIDER', 'AWAITING_CUSTOMER'],
        staleBefore,
        limit: input?.limit ?? 50
      });

      const updated = [];
      for (const intent of intents) {
        const provider = providers.getProvider(intent.provider);
        try {
          const status = await provider.getIntentStatus(intent.providerReference ?? intent.id);
          const body = {
            provider_event_id: `reconcile:${intent.id}:${status.status}`,
            provider_reference: status.providerReference,
            status: status.status,
            ...(status.amount !== null ? { amount: status.amount } : {}),
            ...(status.currency !== null ? { currency: status.currency } : {}),
            occurred_at: new Date().toISOString()
          };
          const result = await applyProviderEvent({
            provider,
            request: {
              headers: {
                'x-mock-momo-signature': signMockMomoWebhook({
                  secret: deps.config.flwWebhookSecretHash ?? 'test-pay-webhook-secret',
                  body
                })
              },
              body
            }
          });
          updated.push(result.intent.id);
        } catch (error) {
          throw new PaymentError({
            code: ErrorCode.PaymentReconciliationFailed,
            message: 'Payment reconciliation failed',
            cause: error
          });
        }
      }

      return {
        checked: intents.length,
        updatedIntentIds: updated
      };
    }
  };
};
