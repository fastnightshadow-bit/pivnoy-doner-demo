import {
  PaymentProviderError,
  formatRubles,
  parseRubles,
} from './provider.js';

const normalizePayment = (body = {}) => ({
  id: String(body.id || ''),
  orderId: String(body.metadata?.order_id || ''),
  status: String(body.status || 'pending'),
  amount: parseRubles(body.amount?.value),
  currency: String(body.amount?.currency || ''),
  confirmationUrl: String(body.confirmation?.confirmation_url || ''),
  raw: body,
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
  }) {
    const body = await this.request('/payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': String(idempotencyKey) },
      body: JSON.stringify({
        amount: { value: formatRubles(amount), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: String(returnUrl) },
        description: `Заказ №${publicNumber || orderId}`.slice(0, 128),
        metadata: { order_id: String(orderId) },
      }),
    });
    return normalizePayment(body);
  }

  async getPayment(paymentId) {
    const id = encodeURIComponent(String(paymentId || ''));
    return normalizePayment(await this.request(`/payments/${id}`));
  }
}
