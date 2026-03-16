import {
  createAuditWriter,
  createIdempotencyService,
  createOutboxWriter,
  runInTransaction,
  type DatabaseSchema
} from '@hypermarket/core';
import { AppError, ErrorCode } from '@hypermarket/contracts';
import type { Kysely } from 'kysely';

import { createCatalogRepoPg } from '../../catalog/persistence/CatalogRepoPg';
import {
  buildFulfillmentSnapshot,
  computeOrderLine,
  computeOrderTotals,
  createOrderRequestHash,
  type FulfillmentInput,
  resolveMerchantOrderAction
} from '../domain';
import { OrderError } from '../errors/OrderError';
import { createOrderRepoPg, type OrderRecord } from '../persistence/OrderRepoPg';
import { toAuditRequestId } from './auditRequestId';

type CheckoutItemInput = {
  productId?: string;
  productSlug?: string;
  variantId?: string;
  quantity: number;
};

type CustomerInput = {
  full_name?: string | null;
  phone_e164?: string | null;
  email?: string | null;
  contact_preference?: string | null;
};

const CREATE_ORDER_OPERATION = 'create_order';
const DEFAULT_LIST_LIMIT = 20;

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const normalizeCustomerSnapshot = (customer: CustomerInput): Record<string, unknown> => ({
  full_name: normalizeOptionalText(customer.full_name),
  phone_e164: normalizeOptionalText(customer.phone_e164),
  email: normalizeOptionalText(customer.email),
  contact_preference: normalizeOptionalText(customer.contact_preference)
});

const hasCustomerIdentity = (customerSnapshot: Record<string, unknown>): boolean =>
  Object.values(customerSnapshot).some((value) => value !== null);

const mapOrderAudit = (order: OrderRecord): Record<string, unknown> => ({
  id: order.id,
  tenant_id: order.tenantId,
  order_number: order.orderNumber,
  status: order.status,
  checkout_mode: order.checkoutMode,
  currency: order.currency,
  subtotal_amount: order.subtotalAmount,
  delivery_fee_amount: order.deliveryFeeAmount,
  discount_amount: order.discountAmount,
  total_amount: order.totalAmount,
  customer_id: order.customerId,
  created_at: order.createdAt.toISOString(),
  updated_at: order.updatedAt.toISOString()
});

const mapAppError = (error: unknown): never => {
  if (error instanceof AppError && error.code === ErrorCode.IdempotencyConflict) {
    throw new OrderError({
      code: ErrorCode.OrderIdempotencyConflict,
      message: 'Idempotency key reuse conflict',
      ...(error.details !== undefined ? { details: error.details } : {}),
      cause: error
    });
  }

  if (
    error instanceof Error &&
    (error.message.includes('orders_tenant_order_number_unique') ||
      error.message.includes('idempotency_keys_tenant_id_operation_idempotency_key_unique'))
  ) {
    throw new OrderError({
      code: ErrorCode.OrderIdempotencyConflict,
      message: 'A conflicting order creation request was detected',
      cause: error
    });
  }

  throw error;
};

const resolveCatalogProduct = async (
  db: Kysely<DatabaseSchema>,
  tenantId: string,
  item: CheckoutItemInput
) => {
  const catalogRepo = createCatalogRepoPg(db);
  const product =
    item.productId !== undefined
      ? await catalogRepo.getProductById(tenantId, item.productId)
      : await catalogRepo.getProductBySlug(tenantId, item.productSlug ?? '');

  if (product === null) {
    throw new OrderError({
      code: ErrorCode.OrderProductNotFound,
      message: 'Product not found'
    });
  }

  if (product.deletedAt !== null || product.status !== 'active') {
    throw new OrderError({
      code: ErrorCode.OrderProductNotAvailable,
      message: 'Product is not available for checkout',
      details: {
        product_id: product.id
      }
    });
  }

  return product;
};

export const createOrderUseCases = (deps: { db: Kysely<DatabaseSchema> }) => {
  const auditWriter = createAuditWriter();
  const outboxWriter = createOutboxWriter();
  const idempotency = createIdempotencyService();

  return {
    async createOrder(input: {
      tenantId: string;
      idempotencyKey: string;
      requestId?: string;
      checkoutMode: 'pay_on_delivery' | 'gateway_payment';
      items: CheckoutItemInput[];
      customer: CustomerInput;
      fulfillment: FulfillmentInput;
      notes?: string | null;
    }) {
      const requestHashInput = {
        tenantId: input.tenantId,
        checkoutMode: input.checkoutMode,
        items: input.items.map((item) => ({
          product_id: item.productId ?? null,
          product_slug: item.productSlug ?? null,
          variant_id: item.variantId ?? null,
          quantity: item.quantity
        })),
        customer: normalizeCustomerSnapshot(input.customer),
        fulfillment: input.fulfillment
      };
      const requestHash = createOrderRequestHash({
        ...requestHashInput,
        ...(input.notes !== undefined ? { notes: input.notes } : {})
      });

      const runCreate = async () =>
        runInTransaction(deps.db, async (trx) => {
          const begin = await idempotency.begin(
            trx,
            input.tenantId,
            CREATE_ORDER_OPERATION,
            input.idempotencyKey,
            requestHash
          );

          const orderRepo = createOrderRepoPg(trx);

          if (begin.status === 'replay') {
            if (begin.record.responseRef === undefined) {
              throw new OrderError({
                code: ErrorCode.OrderIdempotencyConflict,
                message: 'Order creation is already in progress for this idempotency key'
              });
            }

            const existingOrder = await orderRepo.getOrderById(
              input.tenantId,
              begin.record.responseRef
            );
            if (existingOrder === null) {
              throw new OrderError({
                code: ErrorCode.OrderNotFound,
                message: 'Previously created order could not be found'
              });
            }

            return existingOrder;
          }

          if (input.items.length === 0) {
            throw new OrderError({
              code: ErrorCode.OrderInvalidItems,
              message: 'At least one checkout item is required'
            });
          }

          const resolvedItems = [];
          for (const item of input.items) {
            const product = await resolveCatalogProduct(trx, input.tenantId, item);
            const variant =
              item.variantId === undefined
                ? null
                : (product.variants.find((entry) => entry.id === item.variantId) ?? null);

            if (item.variantId !== undefined && variant === null) {
              throw new OrderError({
                code: ErrorCode.OrderVariantNotFound,
                message: 'Variant not found for product',
                details: {
                  product_id: product.id,
                  variant_id: item.variantId
                }
              });
            }

            const stockQuantity = variant?.stockQuantity ?? product.stockQuantity;
            if (
              product.trackInventory &&
              stockQuantity !== null &&
              Number.isInteger(stockQuantity) &&
              stockQuantity < item.quantity
            ) {
              throw new OrderError({
                code: ErrorCode.OrderProductNotAvailable,
                message: 'Requested quantity exceeds available stock',
                details: {
                  product_id: product.id,
                  variant_id: variant?.id ?? null
                }
              });
            }

            const line = computeOrderLine({
              quantity: item.quantity,
              unitPriceAmount: variant?.priceAmount ?? product.priceAmount
            });

            resolvedItems.push({
              productId: product.id,
              variantId: variant?.id ?? null,
              title: variant === null ? product.name : `${product.name} - ${variant.name}`,
              sku: variant?.sku ?? product.sku,
              quantity: line.quantity,
              unitPriceAmount: line.unitPriceAmount,
              lineTotalAmount: line.lineTotalAmount,
              imageUrl: null
            });
          }

          const deliveryFeeAmount = input.fulfillment.type === 'delivery' ? 0 : 0;
          const fulfillmentSnapshot = buildFulfillmentSnapshot(
            input.fulfillment,
            deliveryFeeAmount
          );
          const totals = computeOrderTotals(resolvedItems, deliveryFeeAmount);
          const customerSnapshot = normalizeCustomerSnapshot(input.customer);
          const customer =
            hasCustomerIdentity(customerSnapshot) === false
              ? null
              : await orderRepo.createCustomer({
                  tenantId: input.tenantId,
                  fullName: customerSnapshot.full_name as string | null,
                  phoneE164: customerSnapshot.phone_e164 as string | null,
                  email: customerSnapshot.email as string | null
                });

          const orderNumber = await orderRepo.getNextOrderNumber(input.tenantId);
          const createdOrder = await orderRepo.createOrder(
            {
              tenantId: input.tenantId,
              orderNumber,
              status: 'PENDING',
              checkoutMode: input.checkoutMode,
              currency: 'UGX',
              subtotalAmount: totals.subtotalAmount,
              deliveryFeeAmount: totals.deliveryFeeAmount,
              discountAmount: totals.discountAmount,
              totalAmount: totals.totalAmount,
              customerId: customer?.id ?? null,
              customerSnapshot,
              fulfillmentSnapshot,
              notes: normalizeOptionalText(input.notes)
            },
            resolvedItems
          );

          await orderRepo.appendStateHistory({
            tenantId: input.tenantId,
            orderId: createdOrder.order.id,
            toStatus: 'PENDING',
            actorType: 'customer'
          });

          await auditWriter.write(trx, {
            tenantId: input.tenantId,
            action: 'order.created',
            targetType: 'order',
            targetId: createdOrder.order.id,
            after: mapOrderAudit(createdOrder.order),
            requestId: toAuditRequestId(input.requestId)
          });

          await outboxWriter.write(trx, {
            eventType: 'Order.Created',
            tenantId: input.tenantId,
            correlationId: toAuditRequestId(input.requestId),
            payload: {
              tenant_id: input.tenantId,
              order_id: createdOrder.order.id,
              order_number: createdOrder.order.orderNumber,
              status: createdOrder.order.status,
              total_amount: createdOrder.order.totalAmount
            }
          });

          await idempotency.complete(trx, begin.record.id, createdOrder.order.id);

          return createdOrder;
        });

      try {
        return await runCreate();
      } catch (error) {
        return mapAppError(error);
      }
    },

    async listOrders(input: {
      tenantId: string;
      status?: OrderRecord['status'];
      cursor?: string;
      limit?: number;
    }) {
      const repo = createOrderRepoPg(deps.db);
      return repo.listOrders(input.tenantId, {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        limit: input.limit ?? DEFAULT_LIST_LIMIT
      });
    },

    async getOrder(tenantId: string, orderId: string) {
      const repo = createOrderRepoPg(deps.db);
      const order = await repo.getOrderById(tenantId, orderId);

      if (order === null) {
        throw new OrderError({
          code: ErrorCode.OrderNotFound,
          message: 'Order not found'
        });
      }

      return order;
    },

    async transitionOrder(input: {
      tenantId: string;
      orderId: string;
      actorUserId: string;
      requestId?: string;
      action: 'confirm' | 'cancel' | 'fulfill';
      reason?: string | null;
    }) {
      return runInTransaction(deps.db, async (trx) => {
        const repo = createOrderRepoPg(trx);
        const existing = await repo.getOrderById(input.tenantId, input.orderId);
        if (existing === null) {
          throw new OrderError({
            code: ErrorCode.OrderNotFound,
            message: 'Order not found'
          });
        }

        const nextStatus = resolveMerchantOrderAction(existing.order.status, input.action);
        const updated = await repo.updateOrderStatus({
          tenantId: input.tenantId,
          orderId: input.orderId,
          status: nextStatus
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
          toStatus: nextStatus,
          reason: normalizeOptionalText(input.reason),
          actorType: 'merchant',
          actorUserId: input.actorUserId
        });

        await auditWriter.write(trx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: 'order.state_changed',
          targetType: 'order',
          targetId: updated.id,
          before: mapOrderAudit(existing.order),
          after: mapOrderAudit(updated),
          requestId: toAuditRequestId(input.requestId)
        });

        await outboxWriter.write(trx, {
          eventType: 'Order.StateChanged',
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          correlationId: toAuditRequestId(input.requestId),
          payload: {
            tenant_id: input.tenantId,
            order_id: updated.id,
            order_number: updated.orderNumber,
            from_status: existing.order.status,
            to_status: updated.status,
            action: input.action
          }
        });

        if (updated.status === 'CANCELLED' || updated.status === 'FULFILLED') {
          await outboxWriter.write(trx, {
            eventType: updated.status === 'CANCELLED' ? 'Order.Cancelled' : 'Order.Fulfilled',
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            correlationId: toAuditRequestId(input.requestId),
            payload: {
              tenant_id: input.tenantId,
              order_id: updated.id,
              order_number: updated.orderNumber,
              status: updated.status
            }
          });
        }

        return (await repo.getOrderById(input.tenantId, input.orderId))!;
      });
    }
  };
};
