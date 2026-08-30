import {
  PaymentProviderError,
  parseRubles,
  toMinorUnits,
  validateReceiptAmounts,
} from './provider.js';

const MAX_RECEIPT_DESCRIPTION_LENGTH = 128;

const receiptError = (code) =>
  new PaymentProviderError(code, { status: 409 });

const formatMinorUnits = (minorUnits) => {
  const rubles = Math.floor(minorUnits / 100);
  const kopecks = String(minorUnits % 100).padStart(2, '0');
  return `${rubles}.${kopecks}`;
};

const normalizeRussianPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && ['7', '8'].includes(digits[0])) {
    return `+7${digits.slice(1)}`;
  }
  throw receiptError('PAYMENT_RECEIPT_PHONE_INVALID');
};

const truncateDescription = (name, productId) => {
  const source = String(name || productId || '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!source) throw receiptError('PAYMENT_RECEIPT_DESCRIPTION_REQUIRED');
  return Array.from(source)
    .slice(0, MAX_RECEIPT_DESCRIPTION_LENGTH)
    .join('')
    .trimEnd();
};

const buildReceipt = ({ amount, customerPhone, items, deliveryAmount }) => {
  const sourceItems = Array.isArray(items) ? items : [];
  const {
    paymentMinorUnits,
    deliveryMinorUnits,
    itemMinorUnits,
  } = validateReceiptAmounts({
    amount,
    items: sourceItems,
    deliveryAmount,
  });
  const receiptItems = sourceItems.map((item, index) => {
    const unitMinorUnits = itemMinorUnits[index];
    return {
      description: truncateDescription(item.name, item.productId),
      quantity: item.quantity.toFixed(2),
      amount: {
        value: formatMinorUnits(unitMinorUnits),
        currency: 'RUB',
      },
      vat_code: 1,
      payment_mode: 'full_payment',
      payment_subject: 'commodity',
    };
  });

  if (deliveryMinorUnits > 0) {
    receiptItems.push({
      description: 'Доставка',
      quantity: '1.00',
      amount: {
        value: formatMinorUnits(deliveryMinorUnits),
        currency: 'RUB',
      },
      vat_code: 1,
      payment_mode: 'full_payment',
      payment_subject: 'service',
    });
  }

  return {
    paymentMinorUnits,
    receipt: {
      customer: { phone: normalizeRussianPhone(customerPhone) },
      items: receiptItems,
    },
  };
};

const normalizePayment = (body = {}) => ({
  id: String(body.id || ''),
  orderId: String(body.metadata?.order_id || ''),
  status: String(body.status || 'pending'),
  amount: parseRubles(body.amount?.value),
  currency: String(body.amount?.currency || ''),
  confirmationUrl: String(body.confirmation?.confirmation_url || ''),
});

const normalizeRefund = (body = {}) => ({
  id: String(body.id || ''),
  status: String(body.status || 'pending'),
  paymentId: String(body.payment_id || ''),
  amount: parseRubles(body.amount?.value),
  currency: String(body.amount?.currency || ''),
  receiptRegistration: String(body.receipt_registration || ''),
  cancellationReason: String(body.cancellation_details?.reason || ''),
});

export class YooKassaPaymentProvider {
  constructor({
    shopId,
    secretKey,
    fetcher = globalThis.fetch?.bind(globalThis),
    apiBase = 'https://api.yookassa.ru/v3',
  } = {}) {
    if (!shopId || !secretKey) {
      throw new PaymentProviderError('YOOKASSA_CREDENTIALS_REQUIRED', {
        status: 500,
      });
    }
    if (typeof fetcher !== 'function') {
      throw new PaymentProviderError('PAYMENT_FETCH_UNAVAILABLE', {
        status: 500,
      });
    }
    this.fetcher = fetcher;
    this.apiBase = String(apiBase).replace(/\/$/, '');
    this.authorization = `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
  }

  async request(path, options = {}) {
    const response = await this.fetcher(`${this.apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: this.authorization,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PaymentProviderError('YOOKASSA_REQUEST_FAILED', {
        status: 502,
        details: { providerStatus: response.status },
      });
    }
    return body;
  }

  async createPayment({
    orderId,
    publicNumber,
    amount,
    returnUrl,
    idempotencyKey,
    customerPhone,
    items,
    deliveryAmount,
    paymentMethod,
  }) {
    const { paymentMinorUnits, receipt } = buildReceipt({
      amount,
      customerPhone,
      items,
      deliveryAmount,
    });
    const body = await this.request('/payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': String(idempotencyKey) },
      body: JSON.stringify({
        amount: {
          value: formatMinorUnits(paymentMinorUnits),
          currency: 'RUB',
        },
        capture: true,
        ...(paymentMethod === 'sbp'
          ? { payment_method_data: { type: 'sbp' } }
          : {}),
        confirmation: { type: 'redirect', return_url: String(returnUrl) },
        description: `Заказ №${publicNumber || orderId}`.slice(0, 128),
        metadata: { order_id: String(orderId) },
        receipt,
      }),
    });
    return normalizePayment(body);
  }

  async getPayment(paymentId) {
    const id = encodeURIComponent(String(paymentId || ''));
    return normalizePayment(await this.request(`/payments/${id}`));
  }


  async createRefund({
    paymentId,
    amount,
    currency = 'RUB',
    publicNumber,
    idempotencyKey,
  }) {
    const body = await this.request('/refunds', {
      method: 'POST',
      headers: { 'Idempotence-Key': String(idempotencyKey) },
      body: JSON.stringify({
        payment_id: String(paymentId),
        amount: {
          value: formatMinorUnits(toMinorUnits(amount)),
          currency: String(currency),
        },
        description: `Возврат заказа №${publicNumber}`.slice(0, 128),
      }),
    });
    return normalizeRefund(body);
  }

  async getRefund(refundId) {
    const id = encodeURIComponent(String(refundId || ''));
    return normalizeRefund(await this.request(`/refunds/${id}`));
  }
}
