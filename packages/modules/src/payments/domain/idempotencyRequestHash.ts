import { createHash } from 'node:crypto';

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const createPaymentRequestHash = (input: {
  tenantId: string;
  orderId: string;
  method: string;
  provider: string;
  customerPhoneE164: string | null;
  returnUrl?: string | null;
}): string =>
  createHash('sha256')
    .update(
      stableSerialize({
        tenant_id: input.tenantId,
        order_id: input.orderId,
        method: input.method,
        provider: input.provider,
        customer_phone_e164: input.customerPhoneE164,
        return_url: input.returnUrl ?? null
      })
    )
    .digest('hex');
