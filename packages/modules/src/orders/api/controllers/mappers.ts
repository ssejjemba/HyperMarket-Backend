import type { OrderDetailRecord, OrderRecord } from '../../persistence/OrderRepoPg';

export const mapOrderSummaryDto = (order: OrderRecord) => ({
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
  customer_snapshot: order.customerSnapshot,
  fulfillment_snapshot: order.fulfillmentSnapshot,
  notes: order.notes,
  created_at: order.createdAt.toISOString(),
  updated_at: order.updatedAt.toISOString()
});

export const mapOrderDetailDto = (record: OrderDetailRecord) => ({
  order: mapOrderSummaryDto(record.order),
  customer:
    record.customer === null
      ? null
      : {
          id: record.customer.id,
          tenant_id: record.customer.tenantId,
          full_name: record.customer.fullName,
          phone_e164: record.customer.phoneE164,
          email: record.customer.email,
          notes: record.customer.notes,
          created_at: record.customer.createdAt.toISOString()
        },
  items: record.items.map((item) => ({
    id: item.id,
    tenant_id: item.tenantId,
    order_id: item.orderId,
    product_id: item.productId,
    variant_id: item.variantId,
    title: item.title,
    sku: item.sku,
    quantity: item.quantity,
    unit_price_amount: item.unitPriceAmount,
    line_total_amount: item.lineTotalAmount,
    image_url: item.imageUrl,
    created_at: item.createdAt.toISOString()
  })),
  history: record.history.map((entry) => ({
    id: entry.id,
    tenant_id: entry.tenantId,
    order_id: entry.orderId,
    from_status: entry.fromStatus,
    to_status: entry.toStatus,
    reason: entry.reason,
    actor_type: entry.actorType,
    actor_user_id: entry.actorUserId,
    created_at: entry.createdAt.toISOString()
  }))
});

export const mapPublicOrderDto = (order: OrderRecord) => ({
  order_id: order.id,
  order_number: order.orderNumber,
  status: order.status,
  totals: {
    currency: order.currency,
    subtotal_amount: order.subtotalAmount,
    delivery_fee_amount: order.deliveryFeeAmount,
    discount_amount: order.discountAmount,
    total_amount: order.totalAmount
  }
});
