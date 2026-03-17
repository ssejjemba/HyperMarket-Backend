import type { OutboxRecord } from '@hypermarket/core';

import { SmsRecipient } from '../domain';

export type PlannedNotification = {
  channel: 'sms';
  recipient: string;
  templateId: string;
  templateVersion: number;
  payload: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const readString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const readNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
};

const getCustomerPhone = (payload: Record<string, unknown>): string | undefined => {
  const customer = asRecord(payload.customer);
  return readString(payload.customer_phone_e164, customer.phone_e164);
};

const getMerchantPhone = (payload: Record<string, unknown>): string | undefined =>
  readString(
    payload.merchant_phone_e164,
    payload.contact_phone_e164,
    payload.contact_whatsapp_e164
  );

const appendIfValid = (
  notifications: PlannedNotification[],
  recipient: string | undefined,
  input: Omit<PlannedNotification, 'recipient'>
): void => {
  if (recipient === undefined) {
    return;
  }

  try {
    notifications.push({
      ...input,
      recipient: SmsRecipient.parse(recipient).toString()
    });
  } catch {
    // Invalid recipients are skipped by design at planning time.
  }
};

export const buildNotificationPlan = (event: OutboxRecord): PlannedNotification[] => {
  const payload = asRecord(event.payload);
  const notifications: PlannedNotification[] = [];
  const orderNumber =
    readString(payload.order_number) ?? readNumber(payload.order_number)?.toString();
  const totalAmount = readNumber(payload.total_amount) ?? 0;
  const currency = readString(payload.currency) ?? 'UGX';
  const storeName =
    readString(payload.store_name, payload.tenant_slug, payload.tenant_id) ?? 'your store';

  switch (event.eventType) {
    case 'Order.Created': {
      appendIfValid(notifications, getCustomerPhone(payload), {
        channel: 'sms',
        templateId: 'order.created.customer',
        templateVersion: 1,
        payload: {
          order_number: orderNumber ?? '',
          total_amount: totalAmount,
          currency,
          store_name: storeName,
          fulfillment_type: readString(payload.fulfillment_type) ?? 'pickup',
          created_at: readString(payload.created_at) ?? event.occurredAt.toISOString()
        }
      });
      appendIfValid(notifications, getMerchantPhone(payload), {
        channel: 'sms',
        templateId: 'order.created.merchant',
        templateVersion: 1,
        payload: {
          order_number: orderNumber ?? '',
          total_amount: totalAmount,
          currency,
          customer_phone_e164: getCustomerPhone(payload)
        }
      });
      break;
    }

    case 'Order.StateChanged': {
      const toStatus = readString(payload.to_status);
      if (toStatus === 'CONFIRMED' || toStatus === 'CANCELLED' || toStatus === 'FULFILLED') {
        appendIfValid(notifications, getCustomerPhone(payload), {
          channel: 'sms',
          templateId: 'order.created.customer',
          templateVersion: 1,
          payload: {
            order_number: orderNumber ?? '',
            total_amount: totalAmount,
            currency,
            store_name: storeName,
            fulfillment_type: toStatus.toLowerCase(),
            created_at: readString(payload.updated_at) ?? event.occurredAt.toISOString()
          }
        });
      }
      break;
    }

    case 'Payment.Succeeded': {
      appendIfValid(notifications, getCustomerPhone(payload), {
        channel: 'sms',
        templateId: 'payment.succeeded.customer',
        templateVersion: 1,
        payload: {
          order_number: orderNumber ?? '',
          total_amount: totalAmount,
          currency,
          store_name: storeName
        }
      });
      appendIfValid(notifications, getMerchantPhone(payload), {
        channel: 'sms',
        templateId: 'payment.succeeded.merchant',
        templateVersion: 1,
        payload: {
          order_number: orderNumber ?? '',
          total_amount: totalAmount,
          currency
        }
      });
      break;
    }

    case 'Payment.Failed': {
      appendIfValid(notifications, getCustomerPhone(payload), {
        channel: 'sms',
        templateId: 'payment.failed.customer',
        templateVersion: 1,
        payload: {
          order_number: orderNumber ?? '',
          store_name: storeName
        }
      });
      break;
    }

    case 'Publish.Completed': {
      appendIfValid(notifications, getMerchantPhone(payload), {
        channel: 'sms',
        templateId: 'publish.completed.merchant',
        templateVersion: 1,
        payload: {
          store_name: storeName,
          target_count: Array.isArray(payload.targets) ? payload.targets.length : 0
        }
      });
      break;
    }

    case 'Rollback.Completed':
    default:
      break;
  }

  return notifications;
};
