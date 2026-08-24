import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { priceOrder } from '../src/domain/pricing.js';
import { createOrdersRouter } from '../src/routes/orders.js';

const settings = Object.freeze({
  deliveryPrice: 200,
  freeDeliveryFrom: 2000,
  minimumOrder: 300,
});

const validRequest = () => ({
  fulfillment: 'pickup',
  personalDataConsent: true,
  personalDataConsentVersion: '2026-08-11',
  offerVersion: '2026-08-11',
  customer: { name: 'Илья', phone: '+7 (999) 123-45-67' },
  items: [{ productId: 'nuggets', quantity: 1 }],
});

test('API rejects client-controlled product names and prices', async () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/orders',
    createOrdersRouter({
      orderService: {
        create: async () => assert.fail('invalid request reached order service'),
      },
    }),
  );

  const payload = validRequest();
  payload.items[0].name = 'Бесплатно';
  payload.items[0].unitPrice = 0.01;

  const response = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'tampered-price-request')
    .send(payload);

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'INVALID_ORDER');
});

test('server rejects explicit invalid configuration instead of silently replacing it', () => {
  for (const item of [
    {
      productId: 'classic-shawarma',
      quantity: 1,
      meat: 'free-meat',
      size: 'standard',
    },
    {
      productId: 'classic-shawarma',
      quantity: 1,
      meat: 'chicken',
      size: 'free-size',
    },
    {
      productId: 'classic-shawarma',
      quantity: 1,
      meat: 'chicken',
      size: 'standard',
      addons: { freeAddon: 1 },
    },
    {
      productId: 'nuggets',
      quantity: 1,
      sauces: { freeSauce: 1 },
    },
  ]) {
    assert.throws(
      () => priceOrder({ fulfillment: 'pickup', items: [item] }, settings),
      (error) => error?.code === 'INVALID_PRODUCT_CONFIGURATION',
    );
  }
});

test('server limits the total item count across all order lines', () => {
  assert.throws(
    () =>
      priceOrder(
        {
          fulfillment: 'pickup',
          items: [
            { productId: 'nuggets', quantity: 20 },
            { productId: 'squid-rings', quantity: 20 },
            { productId: 'cheese-sticks', quantity: 11 },
          ],
        },
        settings,
      ),
    (error) => error?.code === 'INVALID_QUANTITY',
  );
});

test('API limits automated order creation bursts', async () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/orders',
    createOrdersRouter({
      orderService: {
        create: async (_input, idempotencyKey) => ({
          created: true,
          accessToken: 'test-access-token',
          order: {
            id: idempotencyKey,
            number: '1',
            status: 'new',
            paymentStatus: 'pending',
            fulfillment: 'pickup',
            itemsTotal: 300,
            deliveryTotal: 0,
            discountTotal: 0,
            total: 300,
            items: [],
          },
        }),
      },
    }),
  );

  for (let index = 0; index < 60; index += 1) {
    const response = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', `rate-limit-${String(index).padStart(3, '0')}`)
      .send(validRequest());
    assert.equal(response.status, 201);
  }

  const blocked = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'rate-limit-blocked')
    .send(validRequest());
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'TOO_MANY_ORDERS');
});
