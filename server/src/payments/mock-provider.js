import { randomUUID } from 'node:crypto';

export class MockPaymentProvider {
  constructor({ createId = randomUUID } = {}) {
    this.createId = createId;
    this.payments = new Map();
  }

  async createPayment({ orderId, amount, returnUrl }) {
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
    return payment;
  }

  async getPayment(paymentId) {
    return this.payments.get(String(paymentId)) ?? null;
  }

  setStatus(paymentId, status) {
    const current = this.payments.get(String(paymentId));
    if (!current) return null;
    const updated = { ...current, status };
    this.payments.set(String(paymentId), updated);
    return updated;
  }
}
