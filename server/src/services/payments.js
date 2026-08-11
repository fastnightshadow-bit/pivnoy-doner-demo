import { randomUUID } from 'node:crypto';
import { verifyOrderAccessToken } from '../domain/order-access.js';
import {
  PaymentProviderError,
  mapProviderStatus,
  toPublicPayment,
  validateReceiptAmounts,
} from '../payments/provider.js';

const getWebhookPaymentId = (payload = {}) =>
  String(payload.object?.id ?? payload.paymentId ?? '').trim();

const prepareReceiptInput = (order) => {
  const items = (Array.isArray(order.items) ? order.items : []).map((item) => ({
    productId: String(item?.productId ?? ''),
    name: String(item?.name ?? ''),
    quantity: item?.quantity,
    unitPrice: item?.unitPrice,
  }));
  const deliveryAmount = order.deliveryTotal ?? 0;
  validateReceiptAmounts({ amount: order.total, items, deliveryAmount });

  return {
    customerPhone: String(order.phone ?? ''),
    items,
    deliveryAmount,
  };
};

const toSafeProviderPayload = (payment = {}) => ({
  id: String(payment.id ?? ''),
  orderId: String(payment.orderId ?? ''),
  status: String(payment.status ?? 'pending'),
  amount: payment.amount,
  currency: String(payment.currency ?? ''),
  confirmationUrl: String(payment.confirmationUrl ?? ''),
});

const assertPaymentOrder = (payment, orderId) => {
  if (payment.orderId !== orderId) {
    throw new PaymentProviderError('PAYMENT_IDEMPOTENCY_CONFLICT', {
      status: 409,
    });
  }
};

const assertProviderPayment = (payment, order) => {
  const providerPaymentId = String(payment?.id ?? '').trim();
  if (!providerPaymentId) {
    throw new PaymentProviderError('PAYMENT_PROVIDER_ID_REQUIRED', {
      status: 409,
    });
  }
  if (String(payment?.orderId ?? '') !== order.id) {
    throw new PaymentProviderError('PAYMENT_ORDER_MISMATCH', { status: 409 });
  }
  if (!Number.isFinite(payment?.amount) || payment.amount !== order.total) {
    throw new PaymentProviderError('PAYMENT_AMOUNT_MISMATCH', { status: 409 });
  }
  if (payment?.currency !== 'RUB') {
    throw new PaymentProviderError('PAYMENT_CURRENCY_MISMATCH', {
      status: 409,
    });
  }
  return providerPaymentId;
};

const assertProviderPaymentOwner = (
  payment,
  { orderId, idempotencyKey, providerPaymentId },
) => {
  if (
    payment.orderId !== orderId ||
    payment.idempotencyKey !== idempotencyKey ||
    payment.providerPaymentId !== providerPaymentId
  ) {
    throw new PaymentProviderError('PAYMENT_PROVIDER_ID_CONFLICT', {
      status: 409,
    });
  }
};

export const createPaymentService = ({
  payments,
  orders,
  provider,
  providerName = 'mock',
  createId = randomUUID,
  returnUrlForOrder,
}) => ({
  create: async (orderId, idempotencyKey, accessToken) => {
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new PaymentProviderError('ORDER_ACCESS_REQUIRED', { status: 401 });
    }

    const key = String(idempotencyKey || '').trim();
    const order = await orders.findById(String(orderId));
    if (!order) {
      throw new PaymentProviderError('ORDER_NOT_FOUND', { status: 404 });
    }
    if (!verifyOrderAccessToken(accessToken, order.accessTokenHash)) {
      throw new PaymentProviderError('ORDER_ACCESS_DENIED', { status: 403 });
    }

    let reservation = await payments.findByIdempotencyKey(key);
    if (reservation) {
      assertPaymentOrder(reservation, order.id);
      if (reservation.providerPaymentId) {
        return toPublicPayment(reservation);
      }
    }

    if (order.paymentStatus === 'paid') {
      throw new PaymentProviderError('ORDER_ALREADY_PAID', { status: 409 });
    }

    const receiptInput = prepareReceiptInput(order);

    if (!reservation) {
      reservation = await payments.reserve({
        id: createId(),
        orderId: order.id,
        provider: providerName,
        idempotencyKey: key,
        amount: order.total,
        currency: 'RUB',
      });
      if (!reservation) {
        throw new PaymentProviderError('PAYMENT_RESERVATION_FAILED', {
          status: 409,
        });
      }
      assertPaymentOrder(reservation, order.id);
      if (reservation.providerPaymentId) {
        return toPublicPayment(reservation);
      }
    }

    const providerPayment = await provider.createPayment({
      orderId: order.id,
      publicNumber: order.number,
      amount: order.total,
      returnUrl: returnUrlForOrder(order.id),
      idempotencyKey: key,
      ...receiptInput,
    });
    const providerPaymentId = assertProviderPayment(providerPayment, order);
    const providerOwner = await payments.findByProviderPaymentId(
      providerPaymentId,
    );
    if (providerOwner) {
      assertProviderPaymentOwner(providerOwner, {
        orderId: order.id,
        idempotencyKey: key,
        providerPaymentId,
      });
      return toPublicPayment(providerOwner);
    }

    const completedPayment = {
      id: reservation.id,
      orderId: order.id,
      provider: providerName,
      providerPaymentId,
      idempotencyKey: key,
      status: mapProviderStatus(providerPayment.status),
      amount: providerPayment.amount,
      currency: providerPayment.currency,
      providerPayload: toSafeProviderPayload(providerPayment),
    };

    try {
      const completed = await payments.completeReservation(completedPayment);
      if (!completed) {
        throw new PaymentProviderError('PAYMENT_RESERVATION_FAILED', {
          status: 409,
        });
      }
      assertPaymentOrder(completed, order.id);
      assertProviderPaymentOwner(completed, {
        orderId: order.id,
        idempotencyKey: key,
        providerPaymentId,
      });
      return toPublicPayment(completed);
    } catch (error) {
      if (error?.code !== '23505') throw error;
      const owner = await payments.findByProviderPaymentId(providerPaymentId);
      if (!owner) throw error;
      assertProviderPaymentOwner(owner, {
        orderId: order.id,
        idempotencyKey: key,
        providerPaymentId,
      });
      return toPublicPayment(owner);
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
        providerPayload: toSafeProviderPayload(verified),
      })) ?? { applied: false }
    );
  },
});
