import { ErrorCode } from '@hypermarket/contracts';

import { OrderError } from '../errors/OrderError';

export type OrderPricedItem = {
  quantity: number;
  unitPriceAmount: number;
};

export type OrderComputedLine = OrderPricedItem & {
  lineTotalAmount: number;
};

export type OrderTotals = {
  subtotalAmount: number;
  deliveryFeeAmount: number;
  discountAmount: number;
  totalAmount: number;
};

const assertMinorUnitAmount = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new OrderError({
      code: ErrorCode.OrderValidationFailed,
      message: `${field} must be an integer greater than or equal to 0`,
      details: {
        field
      }
    });
  }

  return value;
};

export const computeOrderLine = (item: OrderPricedItem): OrderComputedLine => {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new OrderError({
      code: ErrorCode.OrderQuantityInvalid,
      message: 'quantity must be an integer greater than 0'
    });
  }

  const unitPriceAmount = assertMinorUnitAmount(item.unitPriceAmount, 'unit_price_amount');

  return {
    quantity: item.quantity,
    unitPriceAmount,
    lineTotalAmount: unitPriceAmount * item.quantity
  };
};

export const computeOrderTotals = (
  items: OrderPricedItem[],
  deliveryFeeAmount: number,
  discountAmount = 0
): OrderTotals => {
  if (items.length === 0) {
    throw new OrderError({
      code: ErrorCode.OrderInvalidItems,
      message: 'At least one order item is required'
    });
  }

  const subtotalAmount = items
    .map(computeOrderLine)
    .reduce((sum, line) => sum + line.lineTotalAmount, 0);

  const deliveryFee = assertMinorUnitAmount(deliveryFeeAmount, 'delivery_fee_amount');
  const discount = assertMinorUnitAmount(discountAmount, 'discount_amount');
  const totalAmount = subtotalAmount + deliveryFee - discount;

  if (totalAmount < 0) {
    throw new OrderError({
      code: ErrorCode.OrderTotalMismatchInternal,
      message: 'Order total calculation produced an invalid negative total'
    });
  }

  return {
    subtotalAmount,
    deliveryFeeAmount: deliveryFee,
    discountAmount: discount,
    totalAmount
  };
};
