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

const toSafeRefundPayload = (refund = {}) => ({
  id: String(refund.id ?? ''),
  status: String(refund.status ?? 'pending'),
  paymentId: String(refund.paymentId ?? ''),
  amount: refund.amount,
  currency: String(refund.currency ?? ''),
  receiptRegistration: String(refund.receiptRegistration ?? ''),
});

const mapRefundStatus = (status) => {
  if (status === 'succeeded') return 'succeeded';
  if (['canceled', 'cancelled', 'failed'].includes(status)) return 'failed';
  return 'pending';
};

const getDefinitiveRefundError = (error) => {
  if (
    !(error instanceof PaymentProviderError) ||
    error.code !== 'YOOKASSA_REQUEST_FAILED'
  ) {
    return '';
  }
  const providerStatus = Number(error.details?.providerStatus);
  return providerStatus === 403 ? 'REFUND_PROVIDER_FORBIDDEN' : '';
};

const assertProviderRefund = (refund, payment) => {
  if (!String(refund?.id ?? '').trim()) {
    throw new PaymentProviderError('REFUND_PROVIDER_ID_REQUIRED', {
      status: 409,
    });
  }
  if (String(refund?.paymentId ?? '') !== payment.providerPaymentId) {
    throw new PaymentProviderError('REFUND_PAYMENT_MISMATCH', { status: 409 });
  }
  if (refund?.amount !== payment.amount || refund?.currency !== payment.currency) {
    throw new PaymentProviderError('REFUND_AMOUNT_MISMATCH', { status: 409 });
  }
};

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
}) => {
  const createPayment = async ({
    orderId,
    idempotencyKey,
    accessToken = '',
    kioskDeviceId = '',
    paymentMethod,
  }) => {
    const key = String(idempotencyKey || '').trim();
    const order = await orders.findById(String(orderId));
    if (!order) {
      throw new PaymentProviderError('ORDER_NOT_FOUND', { status: 404 });
    }
    if (kioskDeviceId) {
      if (
        order.source !== 'kiosk' ||
        order.kioskDeviceId !== kioskDeviceId
      ) {
        throw new PaymentProviderError('KIOSK_ORDER_ACCESS_DENIED', {
          status: 403,
        });
      }
    } else if (!verifyOrderAccessToken(accessToken, order.accessTokenHash)) {
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
      paymentMethod,
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
  };

  return {
    create: async (orderId, idempotencyKey, accessToken) => {
      if (typeof accessToken !== 'string' || accessToken.length === 0) {
        throw new PaymentProviderError('ORDER_ACCESS_REQUIRED', { status: 401 });
      }
      return createPayment({ orderId, idempotencyKey, accessToken });
    },

    createForKiosk: (orderId, idempotencyKey, kioskDeviceId) =>
      createPayment({
        orderId,
        idempotencyKey,
        kioskDeviceId,
        paymentMethod: 'sbp',
      }),

    getForKiosk: async (orderId, kioskDeviceId) => {
      const order = await orders.findById(String(orderId));
      if (!order) {
        throw new PaymentProviderError('ORDER_NOT_FOUND', { status: 404 });
      }
      if (
        order.source !== 'kiosk' ||
        order.kioskDeviceId !== kioskDeviceId
      ) {
        throw new PaymentProviderError('KIOSK_ORDER_ACCESS_DENIED', {
          status: 403,
        });
      }
      const payment = await payments.findLatestByOrderId(order.id);
      if (!payment) {
        throw new PaymentProviderError('PAYMENT_NOT_FOUND', { status: 404 });
      }
      return toPublicPayment(payment);
    },

  refundFull: async ({ orderId, reason, account }) => {
    const normalizedOrderId = String(orderId || '');
    const order = await orders.findById(normalizedOrderId);
    if (!order) {
      return { status: 'failed', error: 'ORDER_NOT_FOUND' };
    }

    const existing = await payments.findRefundByOrderId(normalizedOrderId);
    if (existing?.status === 'succeeded') return existing;
    if ((order.paymentStatus ?? order.payment_status) === 'refunded') {
      return existing ?? { orderId: normalizedOrderId, status: 'succeeded' };
    }

    const payment = await payments.findPaidByOrderId(normalizedOrderId);
    if (!payment) {
      return { status: 'failed', error: 'PAID_PAYMENT_NOT_FOUND' };
    }
    if (
      payment.orderId !== normalizedOrderId ||
      payment.amount !== order.total ||
      payment.currency !== 'RUB' ||
      !String(payment.providerPaymentId || '').trim()
    ) {
      return { status: 'failed', error: 'REFUND_PAYMENT_MISMATCH' };
    }

    const reservationResult = await payments.reserveRefund({
      orderId: normalizedOrderId,
      paymentId: payment.id,
      idempotencyKey: createId(),
      amount: payment.amount,
      currency: payment.currency,
      reason: String(reason || '').trim(),
      requestedBy: account?.id ?? null,
    });
    const reservation = reservationResult?.refund;
    if (!reservation) {
      return { status: 'failed', error: 'REFUND_RESERVATION_FAILED' };
    }
    if (reservation.status === 'succeeded') return reservation;

    try {
      const providerRefund = await provider.createRefund({
        paymentId: payment.providerPaymentId,
        amount: payment.amount,
        currency: payment.currency,
        publicNumber: order.number ?? order.public_number,
        reason: String(reason || '').trim(),
        idempotencyKey: reservation.idempotencyKey,
      });
      assertProviderRefund(providerRefund, payment);
      const status = mapRefundStatus(providerRefund.status);
      return (
        (await payments.completeRefund({
          orderId: normalizedOrderId,
          idempotencyKey: reservation.idempotencyKey,
          providerRefundId: providerRefund.id,
          status,
          providerPayload: toSafeRefundPayload(providerRefund),
        })) ?? { ...reservation, status: 'pending' }
      );
    } catch (error) {
      const definitiveError = getDefinitiveRefundError(error);
      if (definitiveError && reservationResult.isNewAttempt) {
        return (
          (await payments.failRefund({
            orderId: normalizedOrderId,
            idempotencyKey: reservation.idempotencyKey,
            lastError: definitiveError,
          })) ?? { ...reservation, status: 'failed', lastError: definitiveError }
        );
      }
      return (
        (await payments.noteRefundError({
          orderId: normalizedOrderId,
          idempotencyKey: reservation.idempotencyKey,
          lastError: 'REFUND_PROVIDER_UNAVAILABLE',
        })) ?? { ...reservation, status: 'pending' }
      );
    }
  },

  handleWebhook: async (payload) => {
    const paymentId = getWebhookPaymentId(payload);
    if (!paymentId) {
      throw new PaymentProviderError('INVALID_PAYMENT_WEBHOOK', {
        status: 400,
      });
    }

    if (String(payload?.event || '').startsWith('refund.')) {
      const localRefund = await payments.findRefundByProviderRefundId(paymentId);
      if (!localRefund) {
        throw new PaymentProviderError('REFUND_NOT_FOUND', { status: 404 });
      }

      // Refund webhook fields are untrusted too. YooKassa is queried directly
      // before any local order/payment state is changed.
      const verifiedRefund = await provider.getRefund(paymentId);
      if (!verifiedRefund) {
        throw new PaymentProviderError('REFUND_NOT_FOUND', { status: 404 });
      }
      assertProviderRefund(verifiedRefund, localRefund);
      return (
        (await payments.completeRefund({
          orderId: localRefund.orderId,
          idempotencyKey: localRefund.idempotencyKey,
          providerRefundId: verifiedRefund.id,
          status: mapRefundStatus(verifiedRefund.status),
          providerPayload: toSafeRefundPayload(verifiedRefund),
        })) ?? { applied: false }
      );
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
  };
};
