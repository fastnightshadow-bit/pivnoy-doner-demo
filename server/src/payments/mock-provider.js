import { randomUUID } from 'node:crypto';

export class MockPaymentProvider {
  constructor({ createId = randomUUID } = {}) {
    this.createId = createId;
    this.payments = new Map();
    this.paymentsByIdempotencyKey = new Map();
    this.refunds = new Map();
    this.refundsByIdempotencyKey = new Map();
  }

  async createPayment({ orderId, amount, returnUrl, idempotencyKey }) {
    const key = String(idempotencyKey ?? '').trim();
    if (key && this.paymentsByIdempotencyKey.has(key)) {
      return this.paymentsByIdempotencyKey.get(key);
    }
    const id = `mock-${this.createId()}`;
    const payment = {
      id,
      orderId,
      status: 'pending',
      amount: Math.round(Number(amount) || 0),
      currency: 'RUB',
      confirmationUrl: String(returnUrl || ''),
    };
    this.payments.set(id, payment);
    if (key) this.paymentsByIdempotencyKey.set(key, payment);
    return payment;
  }

  async getPayment(paymentId) {
    return this.payments.get(String(paymentId)) ?? null;
  }

  async createRefund({ paymentId, amount, currency = 'RUB', idempotencyKey }) {
    const key = String(idempotencyKey ?? '').trim();
    if (key && this.refundsByIdempotencyKey.has(key)) {
      return this.refundsByIdempotencyKey.get(key);
    }
    const refund = {
      id: `mock-refund-${this.createId()}`,
      status: 'succeeded',
      paymentId: String(paymentId),
      amount: Math.round(Number(amount) || 0),
      currency: String(currency),
      receiptRegistration: 'succeeded',
      cancellationReason: '',
    };
    this.refunds.set(refund.id, refund);
    if (key) this.refundsByIdempotencyKey.set(key, refund);
    return refund;
  }

  async getRefund(refundId) {
    return this.refunds.get(String(refundId)) ?? null;
  }

  setStatus(paymentId, status) {
    const current = this.payments.get(String(paymentId));
    if (!current) return null;
    const updated = { ...current, status };
    this.payments.set(String(paymentId), updated);
    return updated;
  }
}
