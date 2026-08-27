import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { PaymentProviderError } from '../src/payments/provider.js';
import { YooKassaPaymentProvider } from '../src/payments/yookassa-provider.js';
import { createPaymentsRepository } from '../src/repositories/payments.js';
import { createPaymentService } from '../src/services/payments.js';

const account = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Кухня',
  role: 'kitchen',
};

test('YooKassa full refund uses server payment data and an idempotence key', async () => {
  const calls = [];
  const provider = new YooKassaPaymentProvider({
    shopId: 'shop-1',
    secretKey: 'secret-1',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          id: 'refund-1',
          status: 'succeeded',
          payment_id: 'payment-1',
          amount: { value: '300.00', currency: 'RUB' },
          receipt_registration: 'pending',
        }),
      };
    },
  });

  const refund = await provider.createRefund({
    paymentId: 'payment-1',
    amount: 300,
    currency: 'RUB',
    publicNumber: 17,
    idempotencyKey: 'refund-key-1',
  });

  assert.equal(calls[0].url, 'https://api.yookassa.ru/v3/refunds');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Idempotence-Key'], 'refund-key-1');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    payment_id: 'payment-1',
    amount: { value: '300.00', currency: 'RUB' },
    description: 'Возврат заказа №17',
  });
  assert.equal(refund.status, 'succeeded');
  assert.equal(refund.paymentId, 'payment-1');
  assert.equal(refund.amount, 300);
});

test('YooKassa verifies a refund through the provider refund endpoint', async () => {
  const calls = [];
  const provider = new YooKassaPaymentProvider({
    shopId: 'shop-1',
    secretKey: 'secret-1',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          id: 'refund-1',
          status: 'succeeded',
          payment_id: 'payment-1',
          amount: { value: '300.00', currency: 'RUB' },
        }),
      };
    },
  });

  const refund = await provider.getRefund('refund-1');

  assert.equal(calls[0].url, 'https://api.yookassa.ru/v3/refunds/refund-1');
  assert.equal(calls[0].options.method, undefined);
  assert.deepEqual(refund, {
    id: 'refund-1',
    status: 'succeeded',
    paymentId: 'payment-1',
    amount: 300,
    currency: 'RUB',
    receiptRegistration: '',
    cancellationReason: '',
  });
});

test('refund webhook verifies provider state before marking the order refunded', async () => {
  const completed = [];
  const service = createPaymentService({
    orders: {},
    payments: {
      findRefundByProviderRefundId: async (providerRefundId) => {
        assert.equal(providerRefundId, 'refund-1');
        return {
          orderId: 'order-1',
          paymentId: 'local-payment-1',
          providerPaymentId: 'payment-1',
          providerRefundId: 'refund-1',
          idempotencyKey: 'refund-key-1',
          status: 'pending',
          amount: 300,
          currency: 'RUB',
        };
      },
      completeRefund: async (value) => {
        completed.push(value);
        return { ...value, orderId: 'order-1' };
      },
    },
    provider: {
      getRefund: async (refundId) => {
        assert.equal(refundId, 'refund-1');
        return {
          id: 'refund-1',
          status: 'succeeded',
          paymentId: 'payment-1',
          amount: 300,
          currency: 'RUB',
        };
      },
    },
    providerName: 'yookassa',
    returnUrlForOrder: () => 'https://example.test/order',
  });

  const result = await service.handleWebhook({
    event: 'refund.succeeded',
    object: { id: 'refund-1', status: 'succeeded' },
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0], {
    orderId: 'order-1',
    idempotencyKey: 'refund-key-1',
    providerRefundId: 'refund-1',
    status: 'succeeded',
    providerPayload: {
      id: 'refund-1',
      status: 'succeeded',
      paymentId: 'payment-1',
      amount: 300,
      currency: 'RUB',
      receiptRegistration: '',
    },
  });
});

test('payment service refunds only the paid server amount and persists a safe result', async () => {
  const providerCalls = [];
  const completed = [];
  const service = createPaymentService({
    orders: {
      findById: async () => ({
        id: 'order-1',
        number: 17,
        paymentStatus: 'paid',
        total: 300,
      }),
    },
    payments: {
      findRefundByOrderId: async () => null,
      findPaidByOrderId: async () => ({
        id: 'local-payment-1',
        orderId: 'order-1',
        providerPaymentId: 'payment-1',
        status: 'paid',
        amount: 300,
        currency: 'RUB',
      }),
      reserveRefund: async (value) => ({
        refund: { ...value, status: 'pending' },
        isNewAttempt: true,
      }),
      completeRefund: async (value) => {
        completed.push(value);
        return { ...value, orderId: 'order-1' };
      },
      noteRefundError: async () => null,
    },
    provider: {
      createRefund: async (value) => {
        providerCalls.push(value);
        return {
          id: 'refund-1',
          status: 'succeeded',
          paymentId: 'payment-1',
          amount: 300,
          currency: 'RUB',
          receiptRegistration: 'pending',
        };
      },
    },
    providerName: 'yookassa',
    createId: () => 'refund-key-1',
    returnUrlForOrder: () => 'https://example.test/order',
  });

  const result = await service.refundFull({
    orderId: 'order-1',
    reason: 'Клиент попросил отменить',
    account,
    amount: 1,
    paymentId: 'attacker-payment',
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(providerCalls[0].amount, 300);
  assert.equal(providerCalls[0].paymentId, 'payment-1');
  assert.equal(providerCalls[0].idempotencyKey, 'refund-key-1');
  assert.deepEqual(completed[0].providerPayload, {
    id: 'refund-1',
    status: 'succeeded',
    paymentId: 'payment-1',
    amount: 300,
    currency: 'RUB',
    receiptRegistration: 'pending',
  });
});

test('provider transport uncertainty keeps the same pending refund for safe retry', async () => {
  const errors = [];
  const service = createPaymentService({
    orders: {
      findById: async () => ({
        id: 'order-1', number: 17, paymentStatus: 'paid', total: 300,
      }),
    },
    payments: {
      findRefundByOrderId: async () => null,
      findPaidByOrderId: async () => ({
        id: 'local-payment-1',
        orderId: 'order-1',
        providerPaymentId: 'payment-1',
        status: 'paid',
        amount: 300,
        currency: 'RUB',
      }),
      reserveRefund: async (value) => ({
        refund: { ...value, status: 'pending' },
        isNewAttempt: true,
      }),
      completeRefund: async () => assert.fail('uncertain result must not be completed'),
      noteRefundError: async (value) => {
        errors.push(value);
        return { ...value, status: 'pending' };
      },
    },
    provider: {
      createRefund: async () => {
        throw new Error('network timeout');
      },
    },
    providerName: 'yookassa',
    createId: () => 'refund-key-1',
    returnUrlForOrder: () => 'https://example.test/order',
  });

  const result = await service.refundFull({
    orderId: 'order-1', reason: 'Техническая проблема', account,
  });

  assert.equal(result.status, 'pending');
  assert.equal(errors[0].orderId, 'order-1');
  assert.equal(errors[0].idempotencyKey, 'refund-key-1');
  assert.equal(errors[0].lastError, 'REFUND_PROVIDER_UNAVAILABLE');
});

test('definitive provider rejection marks the refund failed for an explicit retry', async () => {
  const failures = [];
  const service = createPaymentService({
    orders: {
      findById: async () => ({
        id: 'order-1', number: 17, paymentStatus: 'paid', total: 300,
      }),
    },
    payments: {
      findRefundByOrderId: async () => null,
      findPaidByOrderId: async () => ({
        id: 'local-payment-1',
        orderId: 'order-1',
        providerPaymentId: 'payment-1',
        status: 'paid',
        amount: 300,
        currency: 'RUB',
      }),
      reserveRefund: async (value) => ({
        refund: { ...value, status: 'pending' },
        isNewAttempt: true,
      }),
      completeRefund: async () => assert.fail('a rejected refund must not complete'),
      failRefund: async (value) => {
        failures.push(value);
        return { ...value, status: 'failed' };
      },
      noteRefundError: async () =>
        assert.fail('a definitive rejection must not remain pending'),
    },
    provider: {
      createRefund: async () => {
        throw new PaymentProviderError('YOOKASSA_REQUEST_FAILED', {
          status: 502,
          details: { providerStatus: 403 },
        });
      },
    },
    providerName: 'yookassa',
    createId: () => 'refund-key-1',
    returnUrlForOrder: () => 'https://example.test/order',
  });

  const result = await service.refundFull({
    orderId: 'order-1', reason: 'Дублирующий заказ', account,
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(failures[0], {
    orderId: 'order-1',
    idempotencyKey: 'refund-key-1',
    lastError: 'REFUND_PROVIDER_FORBIDDEN',
  });
});

for (const providerStatus of [409, 429]) {
  test(`provider ${providerStatus} uncertainty keeps the refund pending with the same key`, async () => {
    const errors = [];
    const service = createPaymentService({
      orders: {
        findById: async () => ({
          id: 'order-1', number: 17, paymentStatus: 'paid', total: 300,
        }),
      },
      payments: {
        findRefundByOrderId: async () => null,
        findPaidByOrderId: async () => ({
          id: 'local-payment-1',
          orderId: 'order-1',
          providerPaymentId: 'payment-1',
          status: 'paid',
          amount: 300,
          currency: 'RUB',
        }),
        reserveRefund: async (value) => ({
          refund: { ...value, status: 'pending' },
          isNewAttempt: true,
        }),
        completeRefund: async () => assert.fail('an uncertain refund must not complete'),
        failRefund: async () => assert.fail('an uncertain refund must not fail'),
        noteRefundError: async (value) => {
          errors.push(value);
          return { ...value, status: 'pending' };
        },
      },
      provider: {
        createRefund: async () => {
          throw new PaymentProviderError('YOOKASSA_REQUEST_FAILED', {
            status: 502,
            details: { providerStatus },
          });
        },
      },
      providerName: 'yookassa',
      createId: () => 'refund-key-1',
      returnUrlForOrder: () => 'https://example.test/order',
    });

    const result = await service.refundFull({
      orderId: 'order-1', reason: 'Дублирующий заказ', account,
    });

    assert.equal(result.status, 'pending');
    assert.deepEqual(errors[0], {
      orderId: 'order-1',
      idempotencyKey: 'refund-key-1',
      lastError: 'REFUND_PROVIDER_UNAVAILABLE',
    });
  });
}

test('timeout followed by 403 keeps the original refund key pending', async () => {
  let refund = null;
  let callCount = 0;
  let idCount = 0;
  const providerKeys = [];
  const payments = {
    findRefundByOrderId: async () => refund,
    findPaidByOrderId: async () => ({
      id: 'local-payment-1',
      orderId: 'order-1',
      providerPaymentId: 'payment-1',
      status: 'paid',
      amount: 300,
      currency: 'RUB',
    }),
    reserveRefund: async (value) => {
      if (refund && refund.status !== 'failed') {
        return { refund: { ...refund }, isNewAttempt: false };
      }
      refund = { ...value, status: 'pending', lastError: null };
      return { refund: { ...refund }, isNewAttempt: true };
    },
    completeRefund: async () => assert.fail('an uncertain refund must not complete'),
    failRefund: async () => assert.fail('a reused uncertain refund must not fail'),
    noteRefundError: async (value) => {
      refund = { ...refund, ...value, status: 'pending' };
      return { ...refund };
    },
  };
  const service = createPaymentService({
    orders: {
      findById: async () => ({
        id: 'order-1', number: 17, paymentStatus: 'paid', total: 300,
      }),
    },
    payments,
    provider: {
      createRefund: async ({ idempotencyKey }) => {
        providerKeys.push(idempotencyKey);
        callCount += 1;
        if (callCount === 1) throw new Error('network timeout');
        throw new PaymentProviderError('YOOKASSA_REQUEST_FAILED', {
          status: 502,
          details: { providerStatus: 403 },
        });
      },
    },
    providerName: 'yookassa',
    createId: () => `refund-key-${++idCount}`,
    returnUrlForOrder: () => 'https://example.test/order',
  });

  const first = await service.refundFull({
    orderId: 'order-1', reason: 'Дублирующий заказ', account,
  });
  const second = await service.refundFull({
    orderId: 'order-1', reason: 'Дублирующий заказ', account,
  });
  const third = await service.refundFull({
    orderId: 'order-1', reason: 'Дублирующий заказ', account,
  });

  assert.equal(first.status, 'pending');
  assert.equal(second.status, 'pending');
  assert.equal(third.status, 'pending');
  assert.deepEqual(providerKeys, [
    'refund-key-1',
    'refund-key-1',
    'refund-key-1',
  ]);
  assert.equal(refund.lastError, 'REFUND_PROVIDER_UNAVAILABLE');
});

test('payments repository persists a definitive refund failure', async () => {
  const calls = [];
  const repository = createPaymentsRepository({
    query: async (sql, values) => {
      calls.push({ sql, values });
      return {
        rows: [{
          order_id: 'order-1',
          payment_id: 'payment-1',
          idempotency_key: 'refund-key-1',
          status: 'failed',
          amount: 300,
          currency: 'RUB',
          last_error: 'REFUND_PROVIDER_FORBIDDEN',
        }],
      };
    },
  });

  const result = await repository.failRefund({
    orderId: 'order-1',
    idempotencyKey: 'refund-key-1',
    lastError: 'REFUND_PROVIDER_FORBIDDEN',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.lastError, 'REFUND_PROVIDER_FORBIDDEN');
  assert.match(calls[0].sql, /set status = 'failed'/i);
  assert.deepEqual(calls[0].values, [
    'order-1',
    'refund-key-1',
    'REFUND_PROVIDER_FORBIDDEN',
  ]);
});

test('payments repository never downgrades an accepted refund to failed', async () => {
  const calls = [];
  const repository = createPaymentsRepository({
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/update refund_operations/i.test(sql)) return { rows: [] };
      return {
        rows: [{
          order_id: 'order-1',
          payment_id: 'payment-1',
          provider_refund_id: 'provider-refund-1',
          idempotency_key: 'refund-key-1',
          status: 'succeeded',
          amount: 300,
          currency: 'RUB',
          last_error: null,
        }],
      };
    },
  });

  const result = await repository.failRefund({
    orderId: 'order-1',
    idempotencyKey: 'refund-key-1',
    lastError: 'REFUND_PROVIDER_FORBIDDEN',
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.providerRefundId, 'provider-refund-1');
  assert.match(calls[0].sql, /status = 'pending'/i);
  assert.match(calls[0].sql, /provider_refund_id is null/i);
  assert.match(calls[1].sql, /select \* from refund_operations/i);
});

const createCancellationApp = ({ role = 'kitchen', orderStatus = 'ready' } = {}) => {
  const calls = { status: [], refund: [] };
  const target = {
    id: 'order-1',
    public_number: 17,
    status: orderStatus,
    version: 4,
    payment_status: 'paid',
  };
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    authService: {
      authenticate: async () => ({ ...account, role }),
      login: async () => null,
      logout: async () => {},
    },
    staffOrders: {
      listActive: async () => [],
      listHistory: async () => [],
      findCancellationTarget: async () => target,
    },
    statusService: {
      change: async (value) => {
        calls.status.push(value);
        return { ...target, status: 'cancelled', version: 5 };
      },
    },
    paymentService: {
      refundFull: async (value) => {
        calls.refund.push(value);
        return { status: 'succeeded' };
      },
    },
  });
  return { app, calls };
};

test('kitchen cancellation confirms the visible order number and triggers full refund', async () => {
  const { app, calls } = createCancellationApp();
  const response = await request(app)
    .post('/api/staff/orders/order-1/cancel')
    .set('Cookie', 'pivdoner_session=session')
    .send({
      version: 4,
      reasonId: 'customer_request',
      reason: 'Клиент попросил отменить',
      confirmationNumber: '17',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.order.status, 'cancelled');
  assert.equal(response.body.refundStatus, 'succeeded');
  assert.equal(calls.status.length, 1);
  assert.equal(calls.refund[0].orderId, 'order-1');
});

test('cancellation rejects a wrong order number before changing anything', async () => {
  const { app, calls } = createCancellationApp();
  const response = await request(app)
    .post('/api/staff/orders/order-1/cancel')
    .set('Cookie', 'pivdoner_session=session')
    .send({
      version: 4,
      reasonId: 'customer_request',
      reason: 'Клиент попросил отменить',
      confirmationNumber: '99',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'ORDER_NUMBER_CONFIRMATION_MISMATCH');
  assert.equal(calls.status.length, 0);
  assert.equal(calls.refund.length, 0);
});

test('cancelled order retries refund without an invalid second status transition', async () => {
  const { app, calls } = createCancellationApp({ orderStatus: 'cancelled' });
  const response = await request(app)
    .post('/api/staff/orders/order-1/cancel')
    .set('Cookie', 'pivdoner_session=session')
    .send({
      version: 5,
      reasonId: 'technical',
      reason: 'Повтор возврата',
      confirmationNumber: '17',
    });

  assert.equal(response.status, 200);
  assert.equal(calls.status.length, 0);
  assert.equal(calls.refund.length, 1);
});

test('courier cannot cancel or refund restaurant orders', async () => {
  const { app, calls } = createCancellationApp({ role: 'courier' });
  const response = await request(app)
    .post('/api/staff/orders/order-1/cancel')
    .set('Cookie', 'pivdoner_session=session')
    .send({
      version: 4,
      reasonId: 'technical',
      reason: 'Техническая проблема',
      confirmationNumber: '17',
    });

  assert.equal(response.status, 403);
  assert.equal(calls.status.length, 0);
  assert.equal(calls.refund.length, 0);
});
