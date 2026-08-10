import { randomUUID } from 'node:crypto';
import {
  PaymentProviderError,
  mapProviderStatus,
  toPublicPayment,
} from '../payments/provider.js';

const getWebhookPaymentId = (payload = {}) =>
  String(payload.object?.id ?? payload.paymentId ?? '').trim();

export const createPaymentService = ({
  payments,
  orders,
  provider,
  providerName = 'mock',
  createId = randomUUID,
  returnUrlForOrder,
}) => ({
  create: async (orderId, idempotencyKey) => {
    const key = String(idempotencyKey || '').trim();
    const existing = await payments.findByIdempotencyKey(key);
    if (existing) return toPublicPayment(existing);

    const order = await orders.findById(String(orderId));
    if (!order) {
      throw new PaymentProviderError('ORDER_NOT_FOUND', { status: 404 });
    }
    if (order.paymentStatus === 'paid') {
      throw new PaymentProviderError('ORDER_ALREADY_PAID', { status: 409 });
    }

    const providerPayment = await provider.createPayment({
      orderId: order.id,
      publicNumber: order.number,
      amount: order.total,
      returnUrl: returnUrlForOrder(order.id),
      idempotencyKey: key,
    });
    const draft = {
      id: createId(),
      orderId: order.id,
      provider: providerName,
      providerPaymentId: providerPayment.id,
      idempotencyKey: key,
      status: mapProviderStatus(providerPayment.status),
      amount: order.total,
      currency: 'RUB',
      providerPayload: providerPayment,
    };

    try {
      return toPublicPayment(await payments.create(draft));
    } catch (error) {
      if (error?.code !== '23505') throw error;
      const concurrent = await payments.findByIdempotencyKey(key);
      if (!concurrent) throw error;
      return toPublicPayment(concurrent);
    }
  },

  handleWebhook: async (payload) => {
    const paymentId = getWebhookPaymentId(payload);
    if (!paymentId) {
      throw new PaymentProviderError('INVALID_PAYMENT_WEBHOOK', {
        status: 400,
      });
    }
    const local = await payments.findByProviderPaymentId(paymentId);
    if (!local) {
      throw new PaymentProviderError('PAYMENT_NOT_FOUND', { status: 404 });
    }

    // Webhook fields are not trusted. The state below is fetched directly
    // from the configured payment provider before any local update.
    const verified = await provider.getPayment(paymentId);
    if (!verified) {
      throw new PaymentProviderError('PAYMENT_NOT_FOUND', { status: 404 });
    }
    if (verified.orderId !== local.orderId) {
      throw new PaymentProviderError('PAYMENT_ORDER_MISMATCH', { status: 409 });
    }
    if (verified.amount !== local.amount || verified.currency !== local.currency) {
      throw new PaymentProviderError('PAYMENT_AMOUNT_MISMATCH', { status: 409 });
    }

    return (
      (await payments.applyVerifiedState({
        providerPaymentId: paymentId,
        status: mapProviderStatus(verified.status),
        providerPayload: verified.raw ?? verified,
      })) ?? { applied: false }
    );
  },
});
