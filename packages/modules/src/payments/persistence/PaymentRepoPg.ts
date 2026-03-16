import { sql, type Kysely, type Transaction } from 'kysely';

import type { DatabaseSchema } from '@hypermarket/core';

import type { PaymentIntentStatus } from '../domain';
import type { PaymentMethod } from '../provider';

export type PaymentIntentRecord = {
  id: string;
  tenantId: string;
  orderId: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentIntentStatus;
  amount: number;
  currency: string;
  txRef: string;
  providerReference: string | null;
  providerTransactionId: string | null;
  customerPhoneE164: string | null;
  customerEmail: string;
  network: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentProviderEventRecord = {
  id: string;
  provider: string;
  providerEventId: string;
  tenantId: string | null;
  intentId: string | null;
  orderId: string | null;
  payload: Record<string, unknown>;
  receivedAt: Date;
};

const mapIntent = (row: DatabaseSchema['payment_intents']): PaymentIntentRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  orderId: row.order_id,
  provider: row.provider,
  method: row.method,
  status: row.status,
  amount: row.amount,
  currency: row.currency,
  txRef: row.tx_ref,
  providerReference: row.provider_reference,
  providerTransactionId: row.provider_transaction_id,
  customerPhoneE164: row.customer_phone_e164,
  customerEmail: row.customer_email,
  network: row.network,
  failureCode: row.failure_code,
  failureMessage: row.failure_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapEvent = (row: DatabaseSchema['payment_provider_events']): PaymentProviderEventRecord => ({
  id: row.id,
  provider: row.provider,
  providerEventId: row.provider_event_id,
  tenantId: row.tenant_id,
  intentId: row.intent_id,
  orderId: row.order_id,
  payload: row.payload,
  receivedAt: row.received_at
});

export const createPaymentRepoPg = (db: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>) => ({
  async createIntent(input: {
    tenantId: string;
    orderId: string;
    provider: string;
    method: PaymentMethod;
    status: PaymentIntentStatus;
    amount: number;
    currency: string;
    txRef: string;
    customerEmail: string;
    network: string;
    customerPhoneE164?: string | null;
  }): Promise<PaymentIntentRecord> {
    const row = await db
      .insertInto('payment_intents')
      .values({
        id: sql`gen_random_uuid()` as unknown as string,
        tenant_id: input.tenantId,
        order_id: input.orderId,
        provider: input.provider,
        method: input.method,
        status: input.status,
        amount: input.amount,
        currency: input.currency,
        tx_ref: input.txRef,
        provider_reference: null,
        provider_transaction_id: null,
        customer_phone_e164: input.customerPhoneE164 ?? null,
        customer_email: input.customerEmail,
        network: input.network,
        failure_code: null,
        failure_message: null,
        created_at: sql`now()`,
        updated_at: sql`now()`
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapIntent(row);
  },

  async updateIntent(input: {
    tenantId: string;
    intentId: string;
    status: PaymentIntentStatus;
    txRef?: string;
    providerReference?: string | null;
    providerTransactionId?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
  }): Promise<PaymentIntentRecord | null> {
    const row = await db
      .updateTable('payment_intents')
      .set({
        status: input.status,
        updated_at: new Date(),
        ...(input.txRef !== undefined ? { tx_ref: input.txRef } : {}),
        ...(input.providerReference !== undefined
          ? { provider_reference: input.providerReference }
          : {}),
        ...(input.providerTransactionId !== undefined
          ? { provider_transaction_id: input.providerTransactionId }
          : {}),
        ...(input.failureCode !== undefined ? { failure_code: input.failureCode } : {}),
        ...(input.failureMessage !== undefined ? { failure_message: input.failureMessage } : {})
      })
      .where('tenant_id', '=', input.tenantId)
      .where('id', '=', input.intentId)
      .returningAll()
      .executeTakeFirst();

    return row === undefined ? null : mapIntent(row);
  },

  async getIntentById(tenantId: string, intentId: string): Promise<PaymentIntentRecord | null> {
    const row = await db
      .selectFrom('payment_intents')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', intentId)
      .executeTakeFirst();

    return row === undefined ? null : mapIntent(row);
  },

  async getIntentByProviderReference(
    provider: string,
    providerReference: string
  ): Promise<PaymentIntentRecord | null> {
    const row = await db
      .selectFrom('payment_intents')
      .selectAll()
      .where('provider', '=', provider)
      .where('provider_reference', '=', providerReference)
      .executeTakeFirst();

    return row === undefined ? null : mapIntent(row);
  },

  async getIntentByTxRef(provider: string, txRef: string): Promise<PaymentIntentRecord | null> {
    const row = await db
      .selectFrom('payment_intents')
      .selectAll()
      .where('provider', '=', provider)
      .where('tx_ref', '=', txRef)
      .executeTakeFirst();

    return row === undefined ? null : mapIntent(row);
  },

  async getLatestIntentForOrder(
    tenantId: string,
    orderId: string
  ): Promise<PaymentIntentRecord | null> {
    const row = await db
      .selectFrom('payment_intents')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('order_id', '=', orderId)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    return row === undefined ? null : mapIntent(row);
  },

  async listStaleIntents(input: {
    statuses: PaymentIntentStatus[];
    staleBefore: Date;
    limit: number;
  }): Promise<PaymentIntentRecord[]> {
    const rows = await db
      .selectFrom('payment_intents')
      .selectAll()
      .where('status', 'in', input.statuses)
      .where('updated_at', '<', input.staleBefore)
      .orderBy('updated_at', 'asc')
      .limit(input.limit)
      .execute();

    return rows.map(mapIntent);
  },

  async recordProviderEvent(input: {
    provider: string;
    providerEventId: string;
    tenantId?: string | null;
    intentId?: string | null;
    orderId?: string | null;
    payload: Record<string, unknown>;
  }): Promise<{ duplicate: boolean; event: PaymentProviderEventRecord | null }> {
    try {
      const row = await db
        .insertInto('payment_provider_events')
        .values({
          id: sql`gen_random_uuid()` as unknown as string,
          provider: input.provider,
          provider_event_id: input.providerEventId,
          tenant_id: input.tenantId ?? null,
          intent_id: input.intentId ?? null,
          order_id: input.orderId ?? null,
          payload: input.payload,
          received_at: sql`now()`
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return {
        duplicate: false,
        event: mapEvent(row)
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('payment_provider_events_provider_provider_event_id_unique')
      ) {
        return {
          duplicate: true,
          event: null
        };
      }

      throw error;
    }
  }
});
