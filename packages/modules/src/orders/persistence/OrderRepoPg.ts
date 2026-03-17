import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

export type OrderCheckoutMode = 'pay_on_delivery' | 'gateway_payment';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'PAID'
  | 'FAILED'
  | 'FULFILLED'
  | 'REFUNDED';
export type OrderActorType = 'system' | 'merchant' | 'customer';

export type CustomerRecord = {
  id: string;
  tenantId: string;
  fullName: string | null;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  createdAt: Date;
};

export type OrderRecord = {
  id: string;
  tenantId: string;
  orderNumber: number;
  status: OrderStatus;
  checkoutMode: OrderCheckoutMode;
  currency: string;
  subtotalAmount: number;
  deliveryFeeAmount: number;
  discountAmount: number;
  totalAmount: number;
  customerId: string | null;
  customerSnapshot: Record<string, unknown>;
  fulfillmentSnapshot: Record<string, unknown>;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderItemRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  title: string;
  sku: string | null;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
  imageUrl: string | null;
  createdAt: Date;
};

export type OrderStateHistoryRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  actorType: OrderActorType;
  actorUserId: string | null;
  createdAt: Date;
};

export type OrderDetailRecord = {
  order: OrderRecord;
  items: OrderItemRecord[];
  history: OrderStateHistoryRecord[];
  customer: CustomerRecord | null;
};

type CreateCustomerInput = {
  tenantId: string;
  fullName?: string | null;
  phoneE164?: string | null;
  email?: string | null;
  notes?: string | null;
};

type CreateOrderInput = {
  tenantId: string;
  orderNumber: number;
  status: OrderStatus;
  checkoutMode: OrderCheckoutMode;
  currency: string;
  subtotalAmount: number;
  deliveryFeeAmount: number;
  discountAmount: number;
  totalAmount: number;
  customerId?: string | null;
  customerSnapshot: Record<string, unknown>;
  fulfillmentSnapshot: Record<string, unknown>;
  notes?: string | null;
};

type CreateOrderItemInput = {
  productId?: string | null;
  variantId?: string | null;
  title: string;
  sku?: string | null;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
  imageUrl?: string | null;
};

type CreateOrderStateHistoryInput = {
  tenantId: string;
  orderId: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  reason?: string | null;
  actorType: OrderActorType;
  actorUserId?: string | null;
};

type OrderListFilters = {
  status?: OrderStatus;
  cursor?: string;
  limit: number;
};

type DeductProductStockInput = {
  tenantId: string;
  productId: string;
  quantity: number;
};

type DeductVariantStockInput = {
  tenantId: string;
  variantId: string;
  quantity: number;
};

const mapCustomer = (row: DatabaseSchema['customers']): CustomerRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  fullName: row.full_name,
  phoneE164: row.phone_e164,
  email: row.email,
  notes: row.notes,
  createdAt: row.created_at
});

const mapOrder = (row: DatabaseSchema['orders']): OrderRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  orderNumber: Number(row.order_number),
  status: row.status,
  checkoutMode: row.checkout_mode,
  currency: row.currency,
  subtotalAmount: row.subtotal_amount,
  deliveryFeeAmount: row.delivery_fee_amount,
  discountAmount: row.discount_amount,
  totalAmount: row.total_amount,
  customerId: row.customer_id,
  customerSnapshot: row.customer_snapshot,
  fulfillmentSnapshot: row.fulfillment_snapshot,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapOrderItem = (row: DatabaseSchema['order_items']): OrderItemRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  orderId: row.order_id,
  productId: row.product_id,
  variantId: row.variant_id,
  title: row.title,
  sku: row.sku,
  quantity: row.quantity,
  unitPriceAmount: row.unit_price_amount,
  lineTotalAmount: row.line_total_amount,
  imageUrl: row.image_url,
  createdAt: row.created_at
});

const mapOrderHistory = (row: DatabaseSchema['order_state_history']): OrderStateHistoryRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  orderId: row.order_id,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  reason: row.reason,
  actorType: row.actor_type,
  actorUserId: row.actor_user_id,
  createdAt: row.created_at
});

const loadOrderItems = async (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  tenantId: string,
  orderId: string
): Promise<OrderItemRecord[]> => {
  const rows = await db
    .selectFrom('order_items')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('order_id', '=', orderId)
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map(mapOrderItem);
};

const loadOrderHistory = async (
  db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  tenantId: string,
  orderId: string
): Promise<OrderStateHistoryRecord[]> => {
  const rows = await db
    .selectFrom('order_state_history')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('order_id', '=', orderId)
    .orderBy('created_at', 'desc')
    .execute();

  return rows.map(mapOrderHistory);
};

export const createOrderRepoPg = (db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>) => {
  return {
    async deductProductStock(input: DeductProductStockInput): Promise<boolean> {
      const result = await db
        .updateTable('products')
        .set(({ ref }) => ({
          stock_quantity: sql`${ref('stock_quantity')} - ${input.quantity}`,
          updated_at: sql`now()`
        }))
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.productId)
        .where('track_inventory', '=', true)
        .where('stock_quantity', 'is not', null)
        .where('stock_quantity', '>=', input.quantity)
        .returning('id')
        .executeTakeFirst();

      return result !== undefined;
    },

    async deductVariantStock(input: DeductVariantStockInput): Promise<boolean> {
      const result = await db
        .updateTable('product_variants')
        .set(({ ref }) => ({
          stock_quantity: sql`${ref('stock_quantity')} - ${input.quantity}`,
          updated_at: sql`now()`
        }))
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.variantId)
        .where('stock_quantity', 'is not', null)
        .where('stock_quantity', '>=', input.quantity)
        .returning('id')
        .executeTakeFirst();

      return result !== undefined;
    },

    async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
      const row = await db
        .insertInto('customers')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          tenant_id: input.tenantId,
          full_name: input.fullName ?? null,
          phone_e164: input.phoneE164 ?? null,
          email: input.email ?? null,
          notes: input.notes ?? null,
          created_at: sql`now()`
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapCustomer(row);
    },

    async getNextOrderNumber(tenantId: string): Promise<number> {
      const row = await db
        .selectFrom('orders')
        .select((eb) => eb.fn.max('order_number').as('max_order_number'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      return Number(row?.max_order_number ?? 0) + 1;
    },

    async createOrder(
      input: CreateOrderInput,
      items: CreateOrderItemInput[]
    ): Promise<OrderDetailRecord> {
      const row = await db
        .insertInto('orders')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          tenant_id: input.tenantId,
          order_number: input.orderNumber,
          status: input.status,
          checkout_mode: input.checkoutMode,
          currency: input.currency,
          subtotal_amount: input.subtotalAmount,
          delivery_fee_amount: input.deliveryFeeAmount,
          discount_amount: input.discountAmount,
          total_amount: input.totalAmount,
          customer_id: input.customerId ?? null,
          customer_snapshot: input.customerSnapshot,
          fulfillment_snapshot: input.fulfillmentSnapshot,
          notes: input.notes ?? null,
          created_at: sql`now()`,
          updated_at: sql`now()`
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (items.length > 0) {
        await db
          .insertInto('order_items')
          .values(
            items.map((item) => ({
              id: sql`gen_random_uuid()` as unknown as string,
              tenant_id: input.tenantId,
              order_id: row.id,
              product_id: item.productId ?? null,
              variant_id: item.variantId ?? null,
              title: item.title,
              sku: item.sku ?? null,
              quantity: item.quantity,
              unit_price_amount: item.unitPriceAmount,
              line_total_amount: item.lineTotalAmount,
              image_url: item.imageUrl ?? null,
              created_at: sql`now()`
            }))
          )
          .execute();
      }

      return (await this.getOrderById(input.tenantId, row.id)) as OrderDetailRecord;
    },

    async appendStateHistory(
      input: CreateOrderStateHistoryInput
    ): Promise<OrderStateHistoryRecord> {
      const row = await db
        .insertInto('order_state_history')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          tenant_id: input.tenantId,
          order_id: input.orderId,
          from_status: input.fromStatus ?? null,
          to_status: input.toStatus,
          reason: input.reason ?? null,
          actor_type: input.actorType,
          actor_user_id: input.actorUserId ?? null,
          created_at: sql`now()`
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapOrderHistory(row);
    },

    async getOrderById(tenantId: string, orderId: string): Promise<OrderDetailRecord | null> {
      const row = await db
        .selectFrom('orders')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('id', '=', orderId)
        .executeTakeFirst();

      if (row === undefined) {
        return null;
      }

      const [items, history, customer] = await Promise.all([
        loadOrderItems(db, tenantId, row.id),
        loadOrderHistory(db, tenantId, row.id),
        row.customer_id === null
          ? Promise.resolve(null)
          : db
              .selectFrom('customers')
              .selectAll()
              .where('tenant_id', '=', tenantId)
              .where('id', '=', row.customer_id)
              .executeTakeFirst()
              .then((entry) => (entry === undefined ? null : mapCustomer(entry)))
      ]);

      return {
        order: mapOrder(row),
        items,
        history,
        customer
      };
    },

    async listOrders(
      tenantId: string,
      filters: OrderListFilters
    ): Promise<{ items: OrderRecord[]; nextCursor: string | null }> {
      const rows = await db
        .selectFrom('orders')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .$if(filters.status !== undefined, (query) =>
          query.where('status', '=', filters.status as OrderStatus)
        )
        .$if(filters.cursor !== undefined, (query) =>
          query.where('order_number', '<', Number(filters.cursor))
        )
        .orderBy('order_number', 'desc')
        .limit(filters.limit)
        .execute();

      return {
        items: rows.map(mapOrder),
        nextCursor:
          rows.length === filters.limit ? String(Number(rows[rows.length - 1]?.order_number)) : null
      };
    },

    async updateOrderStatus(input: {
      tenantId: string;
      orderId: string;
      status: OrderStatus;
    }): Promise<OrderRecord | null> {
      const row = await db
        .updateTable('orders')
        .set({
          status: input.status,
          updated_at: new Date()
        })
        .where('tenant_id', '=', input.tenantId)
        .where('id', '=', input.orderId)
        .returningAll()
        .executeTakeFirst();

      return row === undefined ? null : mapOrder(row);
    }
  };
};
