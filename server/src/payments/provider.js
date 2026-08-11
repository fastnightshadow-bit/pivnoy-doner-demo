export class PaymentProviderError extends Error {
  constructor(code, { status = 502, details = null } = {}) {
    super(code);
    this.name = 'PaymentProviderError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const MAX_RECEIPT_ITEMS = 80;

const receiptError = (code) =>
  new PaymentProviderError(code, { status: 409 });

export const toMinorUnits = (value, { allowZero = false } = {}) => {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw receiptError('PAYMENT_RECEIPT_AMOUNT_INVALID');
  }
  const minorUnits = value * 100;
  if (!Number.isSafeInteger(minorUnits)) {
    throw receiptError('PAYMENT_RECEIPT_AMOUNT_INVALID');
  }
  return minorUnits;
};

export const validateReceiptAmounts = ({
  amount,
  items,
  deliveryAmount,
}) => {
  const paymentMinorUnits = toMinorUnits(amount);
  const deliveryMinorUnits = toMinorUnits(deliveryAmount ?? 0, {
    allowZero: true,
  });
  const sourceItems = Array.isArray(items) ? items : [];
  if (
    sourceItems.length + (deliveryMinorUnits > 0 ? 1 : 0) >
    MAX_RECEIPT_ITEMS
  ) {
    throw receiptError('PAYMENT_RECEIPT_ITEMS_LIMIT');
  }

  let receiptMinorUnits = deliveryMinorUnits;
  const itemMinorUnits = sourceItems.map((item) => {
    if (!Number.isSafeInteger(item?.quantity) || item.quantity <= 0) {
      throw receiptError('PAYMENT_RECEIPT_QUANTITY_INVALID');
    }
    const unitMinorUnits = toMinorUnits(item.unitPrice);
    const lineMinorUnits = unitMinorUnits * item.quantity;
    if (!Number.isSafeInteger(lineMinorUnits)) {
      throw receiptError('PAYMENT_RECEIPT_AMOUNT_INVALID');
    }
    receiptMinorUnits += lineMinorUnits;
    if (!Number.isSafeInteger(receiptMinorUnits)) {
      throw receiptError('PAYMENT_RECEIPT_AMOUNT_INVALID');
    }
    return unitMinorUnits;
  });

  if (receiptMinorUnits !== paymentMinorUnits) {
    throw receiptError('PAYMENT_RECEIPT_TOTAL_MISMATCH');
  }

  return { paymentMinorUnits, deliveryMinorUnits, itemMinorUnits };
};

export const formatRubles = (amount) =>
  `${Math.max(0, Math.round(Number(amount) || 0)).toFixed(2)}`;

export const parseRubles = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new PaymentProviderError('INVALID_PROVIDER_AMOUNT');
  }
  return amount;
};

export const mapProviderStatus = (status) => {
  if (status === 'succeeded') return 'paid';
  if (status === 'canceled') return 'failed';
  if (status === 'refunded') return 'refunded';
  return 'pending';
};

export const toPublicPayment = (payment = {}) => ({
  id: payment.providerPaymentId ?? payment.id,
  orderId: payment.orderId,
  status: payment.status,
  confirmationUrl:
    payment.confirmationUrl ??
    payment.providerPayload?.confirmationUrl ??
    payment.providerPayload?.confirmation?.confirmation_url ??
    '',
});
