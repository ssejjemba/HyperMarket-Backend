import {
  createAuditWriter,
  createOutboxWriter,
  runInTransaction,
  type DatabaseSchema
} from '@hypermarket/core';
import { ErrorCode } from '@hypermarket/contracts';
import type { Kysely } from 'kysely';

import { OrderError } from '../errors/OrderError';
import { createOrderRepoPg, type OrderStatus } from '../persistence/OrderRepoPg';
import { toAuditRequestId } from './auditRequestId';

type OrderPaymentView = {
  id: string;
  tenantId: string;
  status: OrderStatus;
  checkoutMode: 'pay_on_delivery' | 'gateway_payment';
  totalAmount: number;
  currency: string;
};

export type OrderPaymentPort = {
  getOrderForPayment: (tenantId: string, orderId: string) => Promise<OrderPaymentView>;
  markOrderPaid: (input: {
    tenantId: string;
    orderId: string;
    paymentIntentId: string;
    requestId?: string;
  }) => Promise<OrderPaymentView>;
  markOrderPaymentFailed: (input: {
    tenantId: string;
    orderId: string;
    reason?: string | null;
    requestId?: string;
  }) => Promise<OrderPaymentView>;
  markOrderPaymentExpired: (input: {
    tenantId: string;
    orderId: string;
    reason?: string | null;
    requestId?: string;
  }) => Promise<OrderPaymentView>;
};

const mapOrderForPayment = (order: {
  id: string;
  tenantId: string;
  status: OrderStatus;
  checkoutMode: 'pay_on_delivery' | 'gateway_payment';
  totalAmount: number;
  currency: string;
}): OrderPaymentView => ({
  id: order.id,
  tenantId: order.tenantId,
  status: order.status,
  checkoutMode: order.checkoutMode,
  totalAmount: order.totalAmount,
  currency: order.currency
});

const assertAllowedTarget = (fromStatus: OrderStatus, toStatus: 'PAID' | 'FAILED'): void => {
  if (toStatus === 'PAID' && ['PENDING', 'CONFIRMED'].includes(fromStatus)) {
    return;
  }

  if (toStatus === 'FAILED' && fromStatus === 'PENDING') {
    return;
  }

  throw new OrderError({
    code: ErrorCode.OrderInvalidStateTransition,
    message: `Cannot transition order from ${fromStatus} to ${toStatus}`
  });
};

export const createOrderPaymentPort = (deps: { db: Kysely<DatabaseSchema> }): OrderPaymentPort => {
  const auditWriter = createAuditWriter();
  const outboxWriter = createOutboxWriter();

  const transitionOrder = async (input: {
    tenantId: string;
    orderId: string;
    requestId?: string;
    toStatus: 'PAID' | 'FAILED';
    auditAction: 'order.payment_paid' | 'order.payment_failed' | 'order.payment_expired';
    reason?: string | null;
    paymentIntentId?: string;
  }): Promise<OrderPaymentView> =>
    runInTransaction(deps.db, async (trx) => {
      const repo = createOrderRepoPg(trx);
      const existing = await repo.getOrderById(input.tenantId, input.orderId);
      if (existing === null) {
        throw new OrderError({
          code: ErrorCode.OrderNotFound,
          message: 'Order not found'
        });
      }

      assertAllowedTarget(existing.order.status, input.toStatus);
      const updated = await repo.updateOrderStatus({
        tenantId: input.tenantId,
        orderId: input.orderId,
        status: input.toStatus
      });

      if (updated === null) {
        throw new OrderError({
          code: ErrorCode.OrderNotFound,
          message: 'Order not found'
        });
      }

      await repo.appendStateHistory({
        tenantId: input.tenantId,
        orderId: input.orderId,
        fromStatus: existing.order.status,
        toStatus: input.toStatus,
        reason: input.reason ?? null,
        actorType: 'system'
      });

      await auditWriter.write(trx, {
        tenantId: input.tenantId,
        action: input.auditAction,
        targetType: 'order',
        targetId: updated.id,
        before: {
          status: existing.order.status
        },
        after: {
          status: updated.status,
          payment_intent_id: input.paymentIntentId ?? null
        },
        requestId: toAuditRequestId(input.requestId)
      });

      await outboxWriter.write(trx, {
        eventType: 'Order.StateChanged',
        tenantId: input.tenantId,
        correlationId: toAuditRequestId(input.requestId),
        payload: {
          tenant_id: input.tenantId,
          order_id: updated.id,
          order_number: updated.orderNumber,
          from_status: existing.order.status,
          to_status: updated.status,
          reason: input.reason ?? null,
          payment_intent_id: input.paymentIntentId ?? null,
          action:
            input.toStatus === 'PAID'
              ? 'payment_succeeded'
              : input.auditAction === 'order.payment_expired'
                ? 'payment_expired'
                : 'payment_failed'
        }
      });

      return mapOrderForPayment(updated);
    });

  return {
    async getOrderForPayment(tenantId, orderId) {
      const repo = createOrderRepoPg(deps.db);
      const record = await repo.getOrderById(tenantId, orderId);
      if (record === null) {
        throw new OrderError({
          code: ErrorCode.OrderNotFound,
          message: 'Order not found'
        });
      }

      return mapOrderForPayment(record.order);
    },

    async markOrderPaid(input) {
      return transitionOrder({
        tenantId: input.tenantId,
        orderId: input.orderId,
        toStatus: 'PAID',
        auditAction: 'order.payment_paid',
        reason: 'Payment confirmed',
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
        paymentIntentId: input.paymentIntentId
      });
    },

    async markOrderPaymentFailed(input) {
      return transitionOrder({
        tenantId: input.tenantId,
        orderId: input.orderId,
        toStatus: 'FAILED',
        auditAction: 'order.payment_failed',
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
        reason: input.reason ?? 'Payment failed'
      });
    },

    async markOrderPaymentExpired(input) {
      return transitionOrder({
        tenantId: input.tenantId,
        orderId: input.orderId,
        toStatus: 'FAILED',
        auditAction: 'order.payment_expired',
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
        reason: input.reason ?? 'Payment expired'
      });
    }
  };
};
