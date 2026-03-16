export const createFlutterwaveTxRef = (input: {
  tenantId: string;
  orderId: string;
  paymentIntentId: string;
  now?: Date;
}): string =>
  `t:${input.tenantId}:o:${input.orderId}:pi:${input.paymentIntentId}:ts:${Math.floor(
    (input.now ?? new Date()).getTime() / 1000
  )}`;
