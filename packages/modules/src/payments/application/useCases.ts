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
import {
  createFlutterwaveTxRef,
  createPaymentRequestHash,
  CustomerEmail,
  CustomerPhone,
  FlutterwaveNetwork,
  type PaymentIntentStatus
} from '../domain';
import { PaymentError } from '../errors/PaymentError';
import {
  type PaymentMethod,
  type PaymentProvider,
  type ProviderWebhookHttpRequest
} from '../provider';
import { createPaymentRepoPg, type PaymentIntentRecord } from '../persistence/PaymentRepoPg';
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

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

export const createPaymentUseCases = (deps: {
  db: Kysely<DatabaseSchema>;
  config: AppConfigShape;
  orderPaymentPort: OrderPaymentPort;
}) => {
  const auditWriter = createAuditWriter();
  const outboxWriter = createOutboxWriter();
  const idempotency = createIdempotencyService();
  const providers = createPaymentProviderRegistry(deps.config);
  const loadNotificationPayloadContext = async (
    trx: Parameters<typeof auditWriter.write>[0],
    input: {
      tenantId: string;
      orderId: string;
    }
  ) => {
    const tenant = await trx
      .selectFrom('tenants')
      .select(['business_name'])
      .where('id', '=', input.tenantId)
      .executeTakeFirst();
    const settings = await trx
      .selectFrom('tenant_settings')
      .select(['contact_phone_e164', 'contact_whatsapp_e164'])
      .where('tenant_id', '=', input.tenantId)
      .executeTakeFirst();
    const order = await trx
      .selectFrom('orders')
      .select(['order_number', 'total_amount', 'currency', 'customer_snapshot'])
      .where('id', '=', input.orderId)
      .executeTakeFirst();
    const customerSnapshot = asRecord(order?.customer_snapshot);

    return {
      orderNumber: order?.order_number ?? input.orderId,
      totalAmount: order?.total_amount ?? 0,
      currency: order?.currency ?? 'UGX',
      customerPhoneE164: (customerSnapshot.phone_e164 as string | null | undefined) ?? null,
      storeName: tenant?.business_name ?? input.tenantId,
      merchantPhoneE164: settings?.contact_whatsapp_e164 ?? settings?.contact_phone_e164 ?? null
    };
  };

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

  const persistIntentStatusChange = async (input: {
    trx: Parameters<typeof auditWriter.write>[0];
    repo: ReturnType<typeof createPaymentRepoPg>;
    intent: PaymentIntentRecord;
    status: PaymentIntentStatus;
    providerReference: string | null;
    providerTransactionId: string | null;
    requestId?: string;
    auditAction: string;
  }) => {
    const updatedIntent =
      input.intent.status === input.status || isFinalIntentStatus(input.intent.status)
        ? input.intent
        : await input.repo.updateIntent({
            tenantId: input.intent.tenantId,
            intentId: input.intent.id,
            status: input.status,
            providerReference: input.providerReference,
            providerTransactionId: input.providerTransactionId
          });

    if (updatedIntent === null) {
      throw new PaymentError({
        code: ErrorCode.PaymentIntentNotFound,
        message: 'Payment intent not found'
      });
    }

    await auditWriter.write(input.trx, {
      tenantId: input.intent.tenantId,
      action: input.auditAction,
      targetType: 'payment_intent',
      targetId: updatedIntent.id,
      before: {
        status: input.intent.status
      },
      after: {
        status: updatedIntent.status,
        provider_reference: updatedIntent.providerReference,
        tx_ref: updatedIntent.txRef,
        provider_transaction_id: updatedIntent.providerTransactionId
      },
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {})
    });
    const notificationContext = await loadNotificationPayloadContext(input.trx, {
      tenantId: input.intent.tenantId,
      orderId: input.intent.orderId
    });

    if (updatedIntent.status !== input.intent.status) {
      await outboxWriter.write(input.trx, {
        eventType: updatedIntent.status === 'SUCCEEDED' ? 'Payment.Succeeded' : 'Payment.Failed',
        tenantId: input.intent.tenantId,
        ...(input.requestId !== undefined ? { correlationId: input.requestId } : {}),
        payload: {
          tenant_id: input.intent.tenantId,
          order_id: input.intent.orderId,
          intent_id: updatedIntent.id,
          order_number: notificationContext.orderNumber,
          total_amount: notificationContext.totalAmount,
          currency: notificationContext.currency,
          customer_phone_e164: notificationContext.customerPhoneE164,
          merchant_phone_e164: notificationContext.merchantPhoneE164,
          store_name: notificationContext.storeName,
          provider: updatedIntent.provider,
          provider_reference: updatedIntent.providerReference,
          tx_ref: updatedIntent.txRef,
          provider_transaction_id: updatedIntent.providerTransactionId,
          status: updatedIntent.status
        }
      });

      await transitionOrderForIntent({
        tenantId: input.intent.tenantId,
        orderId: input.intent.orderId,
        intentId: updatedIntent.id,
        status: updatedIntent.status,
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {})
      });
    }

    return updatedIntent;
  };

  const applyProviderEvent = async (input: {
    provider: PaymentProvider;
    request: ProviderWebhookHttpRequest;
    requestId?: string;
  }) =>
    runInTransaction(deps.db, async (trx) => {
      const repo = createPaymentRepoPg(trx);
      const event = input.provider.parseWebhook(input.request);
      const intent = await repo.getIntentByTxRef(input.provider.providerName, event.txRef);

      if (intent === null) {
        throw new PaymentError({
          code: ErrorCode.PaymentIntentNotFound,
          message: 'Payment intent not found for transaction reference'
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

      let nextStatus = mapProviderStatus(event.status);
      let providerReference = intent.providerReference;
      let providerTransactionId = intent.providerTransactionId;

      if (event.status === 'succeeded') {
        const verification = await input.provider.getIntentStatus(event.txRef);
        if (verification.status !== 'succeeded') {
          throw new PaymentError({
            code: ErrorCode.PaymentTransactionVerificationFailed,
            message: 'Flutterwave transaction verification did not confirm success'
          });
        }

        if (
          verification.txRef !== intent.txRef ||
          verification.currency !== intent.currency ||
          verification.amount === null ||
          verification.amount < intent.amount
        ) {
          throw new PaymentError({
            code: ErrorCode.PaymentTransactionMismatch,
            message: 'Flutterwave transaction verification did not match the payment intent',
            details: {
              expected_tx_ref: intent.txRef,
              actual_tx_ref: verification.txRef,
              expected_currency: intent.currency,
              actual_currency: verification.currency,
              expected_amount: intent.amount,
              actual_amount: verification.amount
            }
          });
        }

        nextStatus = 'SUCCEEDED';
        providerReference = verification.providerReference;
        providerTransactionId = verification.providerTransactionId;
      } else if (event.providerTransactionId !== null) {
        providerTransactionId = event.providerTransactionId;
      }

      const updatedIntent = await persistIntentStatusChange({
        trx,
        repo,
        intent,
        status: nextStatus,
        providerReference,
        providerTransactionId,
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
        auditAction: 'payment.webhook.processed'
      });

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
      customerEmail?: string;
      network?: string;
      requestId?: string;
    }) {
      const providerName = input.provider ?? deps.config.paymentDefaultProvider ?? 'flutterwave';
      const phone =
        input.customerPhoneE164 === undefined || input.customerPhoneE164 === null
          ? null
          : CustomerPhone.parse(input.customerPhoneE164).toE164();
      const customerEmail =
        providerName === 'flutterwave'
          ? CustomerEmail.parse(input.customerEmail ?? '').toString()
          : (input.customerEmail ?? '').trim().toLowerCase();
      const network =
        providerName === 'flutterwave'
          ? FlutterwaveNetwork.parse(input.network ?? deps.config.flwDefaultNetwork).toString()
          : (input.network ?? '').trim().toUpperCase();
      const requestHash = createPaymentRequestHash({
        tenantId: input.tenantId,
        orderId: input.orderId,
        method: input.method,
        provider: providerName,
        customerPhoneE164: phone,
        customerEmail,
        network
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

          if (providerName === 'flutterwave' && order.currency !== 'UGX') {
            throw new PaymentError({
              code: ErrorCode.PaymentProviderRejectedRequest,
              message: 'Flutterwave mobile money supports UGX orders only'
            });
          }

          const provider = providers.getProvider(providerName);
          const pendingTxRef = `pending:${begin.record.id}`;
          const created = await repo.createIntent({
            tenantId: input.tenantId,
            orderId: input.orderId,
            provider: provider.providerName,
            method: input.method,
            status: 'CREATED',
            amount: order.totalAmount,
            currency: order.currency,
            txRef: pendingTxRef,
            customerEmail,
            network,
            ...(phone !== null ? { customerPhoneE164: phone } : {})
          });
          const txRef =
            provider.providerName === 'flutterwave'
              ? createFlutterwaveTxRef({
                  tenantId: input.tenantId,
                  orderId: input.orderId,
                  paymentIntentId: created.id
                })
              : created.txRef;

          const withPending = await repo.updateIntent({
            tenantId: input.tenantId,
            intentId: created.id,
            status: 'PENDING_PROVIDER',
            txRef
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
              txRef,
              customerPhoneE164: phone,
              customerEmail,
              network,
              webhookUrl: `/payments/webhooks/${provider.providerName}`
            });
          } catch (error) {
            if (error instanceof PaymentError) {
              throw error;
            }

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
            txRef: providerResult.providerReference,
            providerReference: providerResult.providerReference,
            providerTransactionId: providerResult.providerTransactionId ?? null
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
          const status = await provider.getIntentStatus(intent.txRef);
          let nextStatus = mapProviderStatus(status.status);
          if (status.status === 'succeeded') {
            if (
              status.txRef !== intent.txRef ||
              status.currency !== intent.currency ||
              status.amount === null ||
              status.amount < intent.amount
            ) {
              throw new PaymentError({
                code: ErrorCode.PaymentTransactionMismatch,
                message: 'Flutterwave reconciliation did not match the payment intent',
                details: {
                  expected_tx_ref: intent.txRef,
                  actual_tx_ref: status.txRef,
                  expected_currency: intent.currency,
                  actual_currency: status.currency,
                  expected_amount: intent.amount,
                  actual_amount: status.amount
                }
              });
            }

            nextStatus = 'SUCCEEDED';
          }

          const result = await runInTransaction(deps.db, async (trx) => {
            const repo = createPaymentRepoPg(trx);
            const currentIntent = await repo.getIntentById(intent.tenantId, intent.id);
            if (currentIntent === null) {
              throw new PaymentError({
                code: ErrorCode.PaymentIntentNotFound,
                message: 'Payment intent not found'
              });
            }

            return persistIntentStatusChange({
              trx,
              repo,
              intent: currentIntent,
              status: nextStatus,
              providerReference: status.providerReference,
              providerTransactionId: status.providerTransactionId,
              auditAction: 'payment.reconciliation.processed'
            });
          });
          updated.push(result.id);
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
