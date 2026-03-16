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

export const createOrderRequestHash = (input: {
  tenantId: string;
  checkoutMode: string;
  items: unknown[];
  customer: Record<string, unknown>;
  fulfillment: Record<string, unknown>;
  notes?: string | null;
}): string =>
  createHash('sha256')
    .update(
      stableSerialize({
        tenant_id: input.tenantId,
        checkout_mode: input.checkoutMode,
        items: input.items,
        customer: input.customer,
        fulfillment: input.fulfillment,
        notes: input.notes ?? null
      })
    )
    .digest('hex');
