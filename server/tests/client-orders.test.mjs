import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashOrderAccessToken } from '../src/domain/order-access.js';
import { createOrderService } from '../src/services/orders.js';
import { LEGAL_VERSIONS } from '../../shared/legal.js';

const db = { query: async () => ({ rows: [{ ok: 1 }] }) };

const accessToken = 'private-order-access-token';
const internalOrder = Object.freeze({
  id: 'order-1',
  number: '1464',
  status: 'submitted',
  paymentStatus: 'pending',
  fulfillment: 'delivery',
  itemsTotal: 700,
  deliveryTotal: 200,
  discountTotal: 0,
  total: 900,
  eta: { min: 8, max: 12 },
  createdAt: '2026-08-11T12:34:56.000Z',
  customerName: 'Ilya',
  phone: '+79991234567',
  address: { street: 'Secret street', intercom: '42' },
  comment: 'Customer comment',
  customerComment: 'Internal customer comment',
  courierComment: 'Courier comment',
  personalDataConsentAt: '2026-08-11T12:34:56.000Z',
  personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
  offerVersion: LEGAL_VERSIONS.offer,
  accessTokenHash: hashOrderAccessToken(accessToken),
  idempotencyKey: 'private-idempotency-key',
  version: 7,
  history: [{ status: 'submitted', actorName: 'Ilya' }],
  items: [
    {
      lineId: 'line-1',
      productId: 'classic-shawarma',
      name: 'Classic shawarma',
      quantity: 1,
      unitPrice: 700,
      configuration: {
        meat: 'chicken',
        size: 'giant',
        addons: { cheese: 1, comment: 1 },
        sauces: { tasty: 2, 'access-token': 1 },
        comment: 'Future nested comment',
        kitchenConfiguration: { costPrice: 123 },
      },
      comment: 'Current item comment',
      customerComment: 'Future item customer comment',
      accessToken: 'future-item-secret',
      costPrice: 123,
    },
  ],
});

const expectedPublicOrder = Object.freeze({
  id: 'order-1',
  number: '1464',
  status: 'submitted',
  paymentStatus: 'pending',
  fulfillment: 'delivery',
  itemsTotal: 700,
  deliveryTotal: 200,
  discountTotal: 0,
  total: 900,
  eta: { min: 8, max: 12 },
  createdAt: '2026-08-11T12:34:56.000Z',
  items: [
    {
      lineId: 'line-1',
      productId: 'classic-shawarma',
      name: 'Classic shawarma',
      quantity: 1,
      unitPrice: 700,
      meat: 'chicken',
      size: 'giant',
      addons: { cheese: 1 },
      sauces: { tasty: 2 },
    },
  ],
});

const createPublicOrderApp = () =>
  createApp({
    db,
    orderService: createOrderService({
      orders: {
        findById: async (id) => (id === internalOrder.id ? internalOrder : null),
      },
      settings: {},
    }),
  });

test('order creation returns only the strict public order plus its access token', async () => {
  const app = createApp({
    db,
    orderService: {
      create: async () => ({
        created: true,
        accessToken,
        order: internalOrder,
      }),
    },
  });

  const response = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'client-token-1')
    .send({
      fulfillment: 'pickup',
      customer: { phone: '+7 (999) 123-45-67' },
      items: [{ productId: 'nuggets', quantity: 1 }],
      personalDataConsent: true,
      personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
      offerVersion: LEGAL_VERSIONS.offer,
    });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    ...expectedPublicOrder,
    accessToken,
  });
});

test('клиент получает заказ по непредсказуемому идентификатору', async () => {
  const app = createPublicOrderApp();

  const found = await request(app)
    .get('/api/orders/order-1')
    .set('Authorization', `Bearer ${accessToken}`);
  const missing = await request(app)
    .get('/api/orders/missing')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(found.status, 200);
  assert.deepEqual(found.body, expectedPublicOrder);
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'ORDER_NOT_FOUND' });
});

test('public order access without Authorization is rejected', async () => {
  const response = await request(createPublicOrderApp()).get('/api/orders/order-1');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'ORDER_ACCESS_REQUIRED' });
});

test('public order access with the wrong token is rejected', async () => {
  const response = await request(createPublicOrderApp())
    .get('/api/orders/order-1')
    .set('Authorization', 'Bearer wrong-token');

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'ORDER_ACCESS_DENIED' });
});

test('public order access redacts top-level and nested sensitive fields', async () => {
  const response = await request(createPublicOrderApp())
    .get('/api/orders/order-1')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedPublicOrder);
  assert.equal(JSON.stringify(response.body).includes('comment'), false);
  assert.equal(JSON.stringify(response.body).includes('costPrice'), false);
});

test('отзыв разрешён только после завершения заказа', async () => {
  const calls = [];
  const app = createApp({
    db,
    orderService: { get: async () => null },
    reviewsService: {
      submit: async (orderId, draft) => {
        calls.push({ orderId, draft });
        const error = new Error('ORDER_NOT_COMPLETED');
        error.code = 'ORDER_NOT_COMPLETED';
        error.status = 409;
        throw error;
      },
      list: async () => [],
      findByOrderId: async () => null,
    },
  });

  const response = await request(app)
    .post('/api/orders/order-1/review')
    .send({ rating: 5, authorName: 'Илья', comment: 'Вкусно' });

  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'ORDER_NOT_COMPLETED');
  assert.equal(calls.length, 1);
});

test('публичная выдача содержит только опубликованные отзывы', async () => {
  const app = createApp({
    db,
    reviewsService: {
      submit: async () => null,
      findByOrderId: async () => null,
      list: async () => [
        { id: 'review-1', rating: 5, published: true },
      ],
    },
  });

  const response = await request(app).get('/api/reviews');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    { id: 'review-1', rating: 5, published: true },
  ]);
});
