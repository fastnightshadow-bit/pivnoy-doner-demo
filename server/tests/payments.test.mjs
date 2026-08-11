import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { hashOrderAccessToken } from '../src/domain/order-access.js';
import { MockPaymentProvider } from '../src/payments/mock-provider.js';
import { YooKassaPaymentProvider } from '../src/payments/yookassa-provider.js';
import { createPaymentService } from '../src/services/payments.js';
import { LEGAL_VERSIONS } from '../../shared/legal.js';

test('mock provider creates a redirect payment without real credentials', async () => {
  const provider = new MockPaymentProvider();
  const payment = await provider.createPayment({
    orderId: 'order-1',
    amount: 700,
    returnUrl: 'https://stage.pivdoner.ru/order.html?id=order-1',
  });

  assert.equal(payment.status, 'pending');
  assert.equal(payment.amount, 700);
  assert.equal(payment.orderId, 'order-1');
  assert.match(payment.confirmationUrl, /order\.html\?id=order-1/);
});

test('YooKassa provider sends server credentials, rubles and idempotency key', async () => {
  const calls = [];
  const provider = new YooKassaPaymentProvider({
    shopId: 'shop-1',
    secretKey: 'secret-1',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'pay-1',
          status: 'pending',
          amount: { value: '700.00', currency: 'RUB' },
          confirmation: { confirmation_url: 'https://yookassa.test/pay-1' },
          metadata: { order_id: 'order-1' },
        }),
      };
    },
  });

  const result = await provider.createPayment({
    orderId: 'order-1',
    publicNumber: '1464',
    amount: 700,
    returnUrl: 'https://pivdoner.ru/order.html?id=order-1',
    idempotencyKey: 'payment-key-1',
  });

  assert.equal(calls[0].url, 'https://api.yookassa.ru/v3/payments');
  assert.equal(calls[0].options.headers['Idempotence-Key'], 'payment-key-1');
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  assert.deepEqual(JSON.parse(calls[0].options.body).amount, {
    value: '700.00',
    currency: 'RUB',
  });
  assert.deepEqual(JSON.parse(calls[0].options.body).metadata, {
    order_id: 'order-1',
  });
  assert.equal(
    JSON.parse(calls[0].options.body).confirmation.return_url,
    'https://pivdoner.ru/order.html?id=order-1',
  );
  assert.equal(result.confirmationUrl, 'https://yookassa.test/pay-1');
});

const paymentAccessToken = 'private-payment-access-token';

const createPaymentAccessFixture = ({
  orderExists = true,
  existingPayment = null,
  providerPayment = null,
} = {}) => {
  let storedPayment = existingPayment;
  const calls = {
    orderReads: 0,
    paymentLookups: 0,
    paymentReservations: 0,
    paymentCompletions: 0,
    providerCreates: 0,
    providerArguments: [],
    returnUrlOrderIds: [],
    events: [],
  };
  const order = {
    id: 'order-1',
    number: '1464',
    total: 700,
    paymentStatus: 'pending',
    accessTokenHash: hashOrderAccessToken(paymentAccessToken),
  };
  const service = createPaymentService({
    payments: {
      findByIdempotencyKey: async () => {
        calls.paymentLookups += 1;
        return storedPayment;
      },
      findByProviderPaymentId: async () => null,
      reserve: async (payment) => {
        calls.paymentReservations += 1;
        calls.events.push('reserve');
        if (!storedPayment) {
          storedPayment = {
            ...payment,
            providerPaymentId: null,
            providerPayload: {},
          };
        }
        return storedPayment;
      },
      completeReservation: async (payment) => {
        calls.paymentCompletions += 1;
        calls.events.push('complete');
        storedPayment = { ...storedPayment, ...payment };
        return storedPayment;
      },
      create: async (payment) => {
        calls.events.push('legacy-create');
        storedPayment = payment;
        return payment;
      },
    },
    orders: {
      findById: async () => {
        calls.orderReads += 1;
        return orderExists ? order : null;
      },
    },
    provider: {
      createPayment: async (input) => {
        calls.providerCreates += 1;
        calls.events.push('provider');
        calls.providerArguments.push(input);
        return providerPayment ?? {
          id: 'provider-payment-1',
          orderId: input.orderId,
          status: 'pending',
          amount: input.amount,
          currency: 'RUB',
          confirmationUrl: input.returnUrl,
        };
      },
    },
    createId: () => 'local-payment-1',
    returnUrlForOrder: (orderId) => {
      calls.returnUrlOrderIds.push(orderId);
      return `https://pivdoner.ru/order.html?id=${encodeURIComponent(orderId)}`;
    },
  });
  return {
    app: createApp({
      db: { query: async () => ({ rows: [{ ok: 1 }] }) },
      paymentService: service,
    }),
    calls,
  };
};

const postPayment = (app, token) => {
  const pending = request(app)
    .post('/api/payments')
    .set('Idempotency-Key', 'payment-retry-1');
  if (token !== undefined) pending.set('Authorization', `Bearer ${token}`);
  return pending.send({ orderId: 'order-1' });
};

test('payment retry access without Authorization is rejected before payment lookup', async () => {
  const { app, calls } = createPaymentAccessFixture();

  const response = await postPayment(app);

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'ORDER_ACCESS_REQUIRED' });
  assert.equal(calls.paymentLookups, 0);
  assert.equal(calls.providerCreates, 0);
});

test('payment retry access with the wrong token is rejected before payment lookup', async () => {
  const { app, calls } = createPaymentAccessFixture();

  const response = await postPayment(app, 'wrong-token');

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'ORDER_ACCESS_DENIED' });
  assert.equal(calls.paymentLookups, 0);
  assert.equal(calls.providerCreates, 0);
});

test('payment retry access with the matching token creates a payment without leaking it', async () => {
  const { app, calls } = createPaymentAccessFixture();

  const response = await postPayment(app, paymentAccessToken);

  assert.equal(response.status, 201);
  assert.equal(response.body.orderId, 'order-1');
  assert.equal(calls.orderReads, 1);
  assert.equal(calls.paymentLookups, 1);
  assert.equal(calls.paymentReservations, 1);
  assert.equal(calls.paymentCompletions, 1);
  assert.equal(calls.providerCreates, 1);
  assert.deepEqual(calls.events, ['reserve', 'provider', 'complete']);
  assert.deepEqual(calls.returnUrlOrderIds, ['order-1']);
  assert.equal(
    JSON.stringify(calls.providerArguments).includes(paymentAccessToken),
    false,
  );
  assert.equal(JSON.stringify(response.body).includes(paymentAccessToken), false);
});

test('payment retry access returns not found before payment lookup for a missing order', async () => {
  const { app, calls } = createPaymentAccessFixture({ orderExists: false });

  const response = await postPayment(app, paymentAccessToken);

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'ORDER_NOT_FOUND' });
  assert.equal(calls.paymentLookups, 0);
  assert.equal(calls.providerCreates, 0);
});

test('payment retry access cannot reuse an idempotency key from another order', async () => {
  const { app, calls } = createPaymentAccessFixture({
    existingPayment: {
      id: 'other-local-payment',
      orderId: 'other-order',
      providerPaymentId: 'other-provider-payment',
      status: 'pending',
    },
  });

  const response = await postPayment(app, paymentAccessToken);

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { error: 'PAYMENT_IDEMPOTENCY_CONFLICT' });
  assert.equal(calls.providerCreates, 0);
});

test('payment retry access rejects a concurrent idempotency collision from another order', async () => {
  let paymentLookups = 0;
  let storedPayment = null;
  let releaseLookups;
  const lookupsReady = new Promise((resolve) => {
    releaseLookups = resolve;
  });
  const providerOrders = [];
  const accessTokens = {
    'order-1': 'private-payment-access-token-1',
    'order-2': 'private-payment-access-token-2',
  };
  const service = createPaymentService({
    payments: {
      findByIdempotencyKey: async () => {
        paymentLookups += 1;
        if (paymentLookups <= 2) {
          if (paymentLookups === 2) releaseLookups();
          await lookupsReady;
          return null;
        }
        return storedPayment;
      },
      findByProviderPaymentId: async () => null,
      reserve: async (payment) => {
        if (!storedPayment) {
          storedPayment = {
            ...payment,
            providerPaymentId: null,
            providerPayload: {},
          };
        }
        return storedPayment;
      },
      completeReservation: async (payment) => {
        storedPayment = { ...storedPayment, ...payment };
        return storedPayment;
      },
      create: async (payment) => {
        if (storedPayment) {
          const error = new Error('unique violation');
          error.code = '23505';
          throw error;
        }
        storedPayment = payment;
        return payment;
      },
    },
    orders: {
      findById: async (id) => ({
        id,
        number: id === 'order-1' ? '1464' : '2468',
        total: 700,
        paymentStatus: 'pending',
        accessTokenHash: hashOrderAccessToken(accessTokens[id]),
      }),
    },
    provider: {
      createPayment: async ({ orderId, amount, returnUrl }) => {
        providerOrders.push(orderId);
        return {
          id: `provider-payment-${orderId}`,
          orderId,
          amount,
          status: 'pending',
          currency: 'RUB',
          confirmationUrl: returnUrl,
        };
      },
    },
    returnUrlForOrder: (orderId) =>
      `https://pivdoner.ru/order.html?id=${encodeURIComponent(orderId)}`,
  });

  const results = await Promise.allSettled([
    service.create('order-1', 'payment-retry-1', accessTokens['order-1']),
    service.create('order-2', 'payment-retry-1', accessTokens['order-2']),
  ]);

  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  const [rejected] = results.filter(({ status }) => status === 'rejected');
  assert.equal(rejected.reason.code, 'PAYMENT_IDEMPOTENCY_CONFLICT');
  assert.equal(rejected.reason.status, 409);
  assert.equal(providerOrders.length, 1);
  assert.equal(providerOrders[0], storedPayment.orderId);
});

test('payment creation rejects mismatched provider results before final persistence', async () => {
  const cases = [
    {
      label: 'missing provider id',
      providerPayment: {
        id: '',
        orderId: 'order-1',
        amount: 700,
        currency: 'RUB',
        status: 'pending',
      },
      code: 'PAYMENT_PROVIDER_ID_REQUIRED',
    },
    {
      label: 'other order',
      providerPayment: {
        id: 'provider-payment-1',
        orderId: 'other-order',
        amount: 700,
        currency: 'RUB',
        status: 'pending',
      },
      code: 'PAYMENT_ORDER_MISMATCH',
    },
    {
      label: 'wrong amount',
      providerPayment: {
        id: 'provider-payment-1',
        orderId: 'order-1',
        amount: 999,
        currency: 'RUB',
        status: 'pending',
      },
      code: 'PAYMENT_AMOUNT_MISMATCH',
    },
    {
      label: 'wrong currency',
      providerPayment: {
        id: 'provider-payment-1',
        orderId: 'order-1',
        amount: 700,
        currency: 'USD',
        status: 'pending',
      },
      code: 'PAYMENT_CURRENCY_MISMATCH',
    },
  ];

  for (const { label, providerPayment, code } of cases) {
    const { app, calls } = createPaymentAccessFixture({ providerPayment });
    const response = await postPayment(app, paymentAccessToken);

    assert.equal(response.status, 409, label);
    assert.equal(response.body.error, code, label);
    assert.equal(calls.paymentReservations, 1, label);
    assert.equal(calls.paymentCompletions, 0, label);
  }
});

test('payment creation rejects a provider id already owned by another local payment', async () => {
  let completed = false;
  const service = createPaymentService({
    payments: {
      findByIdempotencyKey: async () => null,
      reserve: async (payment) => ({ ...payment, providerPaymentId: null }),
      findByProviderPaymentId: async () => ({
        id: 'orphan-local-payment',
        orderId: 'other-order',
        providerPaymentId: 'provider-payment-orphan',
        idempotencyKey: 'other-payment-key',
        amount: 700,
        currency: 'RUB',
      }),
      completeReservation: async () => {
        completed = true;
        assert.fail('must not attach an orphan provider payment');
      },
      create: async (payment) => payment,
    },
    orders: {
      findById: async () => ({
        id: 'order-1',
        number: '1464',
        total: 700,
        paymentStatus: 'pending',
        accessTokenHash: hashOrderAccessToken(paymentAccessToken),
      }),
    },
    provider: {
      createPayment: async () => ({
        id: 'provider-payment-orphan',
        orderId: 'order-1',
        amount: 700,
        currency: 'RUB',
        status: 'pending',
      }),
    },
    returnUrlForOrder: () => 'https://pivdoner.ru/order.html?id=order-1',
  });

  await assert.rejects(
    service.create('order-1', 'payment-retry-1', paymentAccessToken),
    (error) =>
      error.code === 'PAYMENT_PROVIDER_ID_CONFLICT' && error.status === 409,
  );
  assert.equal(completed, false);
});

test('repeated webhook verifies provider state and applies payment once', async () => {
  let applied = false;
  let providerReads = 0;
  const payments = {
    findByProviderPaymentId: async () => ({
      id: 'local-pay-1',
      orderId: 'order-1',
      amount: 700,
      currency: 'RUB',
      status: applied ? 'paid' : 'pending',
    }),
    applyVerifiedState: async ({ status }) => {
      if (applied && status === 'paid') return { applied: false };
      applied = status === 'paid';
      return { applied: true };
    },
  };
  const provider = {
    getPayment: async () => {
      providerReads += 1;
      return {
        id: 'pay-1',
        orderId: 'order-1',
        status: 'succeeded',
        amount: 700,
        currency: 'RUB',
      };
    },
  };
  const service = createPaymentService({
    payments,
    orders: { findById: async () => null },
    provider,
    returnUrlForOrder: () => 'https://pivdoner.ru/order.html',
  });

  const first = await service.handleWebhook({
    event: 'payment.succeeded',
    object: { id: 'pay-1', amount: { value: '1.00' } },
  });
  const second = await service.handleWebhook({
    event: 'payment.succeeded',
    object: { id: 'pay-1', amount: { value: '1.00' } },
  });

  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(providerReads, 2);
});

test('webhook rejects a provider payment with a mismatched amount', async () => {
  const service = createPaymentService({
    payments: {
      findByProviderPaymentId: async () => ({
        id: 'local-pay-1',
        orderId: 'order-1',
        amount: 700,
        currency: 'RUB',
        status: 'pending',
      }),
      applyVerifiedState: async () => assert.fail('must not update payment'),
    },
    orders: { findById: async () => null },
    provider: {
      getPayment: async () => ({
        id: 'pay-1',
        orderId: 'order-1',
        status: 'succeeded',
        amount: 1,
        currency: 'RUB',
      }),
    },
    returnUrlForOrder: () => 'https://pivdoner.ru/order.html',
  });

  await assert.rejects(
    service.handleWebhook({ event: 'payment.succeeded', object: { id: 'pay-1' } }),
    /PAYMENT_AMOUNT_MISMATCH/,
  );
});

test('order creation returns a payment confirmation and webhook is idempotent', async () => {
  const createCalls = [];
  const paymentService = {
    create: async (...args) => {
      createCalls.push(args);
      return {
        id: 'pay-1',
        orderId: args[0],
        status: 'pending',
        confirmationUrl: 'https://yookassa.test/pay-1',
      };
    },
    handleWebhook: async () => ({ applied: true }),
  };
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: {
      create: async () => ({
        created: true,
        accessToken: paymentAccessToken,
        order: {
          id: 'order-1',
          number: '1464',
          status: 'submitted',
          paymentStatus: 'pending',
          fulfillment: 'pickup',
          itemsTotal: 700,
          deliveryTotal: 0,
          discountTotal: 0,
          total: 700,
          eta: { min: 8, max: 12 },
          createdAt: '2026-08-11T12:34:56.000Z',
          items: [],
          accessTokenHash: hashOrderAccessToken(paymentAccessToken),
          personalDataConsentAt: '2026-08-11T12:34:56.000Z',
        },
      }),
    },
    paymentService,
  });

  const created = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'checkout-payment-1')
    .send({
      fulfillment: 'pickup',
      customer: { phone: '+7 (999) 123-45-67' },
      items: [{ productId: 'nuggets', quantity: 1 }],
      personalDataConsent: true,
      personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
      offerVersion: LEGAL_VERSIONS.offer,
    });
  const webhook = await request(app)
    .post('/api/payments/webhook')
    .send({ event: 'payment.succeeded', object: { id: 'pay-1' } });

  assert.equal(created.status, 201);
  assert.equal(created.body.payment.confirmationUrl, 'https://yookassa.test/pay-1');
  assert.deepEqual(createCalls, [
    ['order-1', 'order-1', paymentAccessToken],
  ]);
  assert.equal(created.body.accessToken, paymentAccessToken);
  assert.equal(Object.hasOwn(created.body, 'accessTokenHash'), false);
  assert.equal(Object.hasOwn(created.body, 'personalDataConsentAt'), false);
  assert.equal(webhook.status, 200);
  assert.equal(webhook.body.applied, true);
});
