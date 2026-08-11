import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
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
  assert.equal(result.confirmationUrl, 'https://yookassa.test/pay-1');
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
  const paymentService = {
    create: async (orderId) => ({
      id: 'pay-1',
      orderId,
      status: 'pending',
      confirmationUrl: 'https://yookassa.test/pay-1',
    }),
    handleWebhook: async () => ({ applied: true }),
  };
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: {
      create: async () => ({
        created: true,
        order: { id: 'order-1', number: '1464', total: 700 },
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
  assert.equal(webhook.status, 200);
  assert.equal(webhook.body.applied, true);
});
