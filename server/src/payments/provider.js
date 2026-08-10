export class PaymentProviderError extends Error {
  constructor(code, { status = 502, details = null } = {}) {
    super(code);
    this.name = 'PaymentProviderError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const formatRubles = (amount) =>
  `${Math.max(0, Math.round(Number(amount) || 0)).toFixed(2)}`;

export const parseRubles = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new PaymentProviderError('INVALID_PROVIDER_AMOUNT');
  }
  return Math.round(amount);
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
