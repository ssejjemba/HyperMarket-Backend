import { z } from 'zod';

import { ErrorCode } from '@hypermarket/contracts';

import { NotificationError } from '../errors/NotificationError';

export type NotificationChannel = 'whatsapp' | 'sms' | 'email';

export type NotificationTemplateDefinition<TPayload extends Record<string, unknown>> = {
  channel: NotificationChannel;
  templateId: string;
  templateVersion: number;
  payloadSchema: z.ZodType<TPayload>;
  render: (payload: TPayload) => { text: string; subject?: string | undefined };
};

const customerOrderConfirmationSchema = z.object({
  order_number: z.union([z.number(), z.string()]),
  total_amount: z.number(),
  currency: z.string(),
  store_name: z.string(),
  fulfillment_type: z.string(),
  created_at: z.string()
});

const customerPaymentSuccessSchema = z.object({
  order_number: z.union([z.number(), z.string()]),
  total_amount: z.number(),
  currency: z.string(),
  store_name: z.string()
});

const customerPaymentFailedSchema = z.object({
  order_number: z.union([z.number(), z.string()]),
  store_name: z.string()
});

const merchantNewOrderSchema = z.object({
  order_number: z.union([z.number(), z.string()]),
  total_amount: z.number(),
  currency: z.string(),
  customer_phone_e164: z.string().optional()
});

const merchantOrderPaidSchema = z.object({
  order_number: z.union([z.number(), z.string()]),
  total_amount: z.number(),
  currency: z.string()
});

const publishSuccessSchema = z.object({
  store_name: z.string(),
  target_count: z.number()
});

const TEMPLATE_REGISTRY = new Map<string, NotificationTemplateDefinition<Record<string, unknown>>>([
  [
    'sms:order.created.customer:1',
    {
      channel: 'sms',
      templateId: 'order.created.customer',
      templateVersion: 1,
      payloadSchema: customerOrderConfirmationSchema,
      render: (payload) => ({
        text: `Order #${payload.order_number} confirmed at ${payload.store_name}. Total ${payload.currency} ${payload.total_amount}. Fulfillment: ${payload.fulfillment_type}.`
      })
    }
  ],
  [
    'sms:payment.succeeded.customer:1',
    {
      channel: 'sms',
      templateId: 'payment.succeeded.customer',
      templateVersion: 1,
      payloadSchema: customerPaymentSuccessSchema,
      render: (payload) => ({
        text: `Payment received for order #${payload.order_number} at ${payload.store_name}. Total ${payload.currency} ${payload.total_amount}.`
      })
    }
  ],
  [
    'sms:payment.failed.customer:1',
    {
      channel: 'sms',
      templateId: 'payment.failed.customer',
      templateVersion: 1,
      payloadSchema: customerPaymentFailedSchema,
      render: (payload) => ({
        text: `Payment failed for order #${payload.order_number} at ${payload.store_name}. Please try again.`
      })
    }
  ],
  [
    'sms:order.created.merchant:1',
    {
      channel: 'sms',
      templateId: 'order.created.merchant',
      templateVersion: 1,
      payloadSchema: merchantNewOrderSchema,
      render: (payload) => ({
        text: `New order #${payload.order_number}. Total ${payload.currency} ${payload.total_amount}.`
      })
    }
  ],
  [
    'sms:payment.succeeded.merchant:1',
    {
      channel: 'sms',
      templateId: 'payment.succeeded.merchant',
      templateVersion: 1,
      payloadSchema: merchantOrderPaidSchema,
      render: (payload) => ({
        text: `Order #${payload.order_number} is paid. Total ${payload.currency} ${payload.total_amount}.`
      })
    }
  ],
  [
    'sms:publish.completed.merchant:1',
    {
      channel: 'sms',
      templateId: 'publish.completed.merchant',
      templateVersion: 1,
      payloadSchema: publishSuccessSchema,
      render: (payload) => ({
        text: `${payload.store_name} published successfully. Revalidated ${payload.target_count} storefront targets.`
      })
    }
  ]
]);

const createTemplateKey = (
  channel: NotificationChannel,
  templateId: string,
  version: number
): string => `${channel}:${templateId}:${version}`;

export const getNotificationTemplate = (
  channel: NotificationChannel,
  templateId: string,
  version: number
): NotificationTemplateDefinition<Record<string, unknown>> => {
  const template = TEMPLATE_REGISTRY.get(createTemplateKey(channel, templateId, version));
  if (template === undefined) {
    throw new NotificationError({
      code: ErrorCode.NotTemplateNotFound,
      message: `Notification template ${templateId}@${version} was not found for ${channel}`
    });
  }

  return template;
};

export const renderNotificationTemplate = (input: {
  channel: NotificationChannel;
  templateId: string;
  templateVersion: number;
  payload: Record<string, unknown>;
}): { text: string; subject?: string | undefined } => {
  const template = getNotificationTemplate(input.channel, input.templateId, input.templateVersion);
  const parsed = template.payloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new NotificationError({
      code: ErrorCode.NotTemplatePayloadInvalid,
      message: parsed.error.issues[0]?.message ?? 'Notification template payload is invalid',
      details: {
        template_id: input.templateId,
        template_version: input.templateVersion,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  return template.render(parsed.data);
};
