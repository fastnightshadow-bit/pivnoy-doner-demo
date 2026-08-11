import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LEGAL_VERSIONS } from '../../shared/legal.js';

const db = { query: async () => ({ rows: [{ ok: 1 }] }) };

test('order creation returns the service access token to the client', async () => {
  const app = createApp({
    db,
    orderService: {
      create: async () => ({
        created: true,
        accessToken: 'raw-access-token',
        order: { id: 'order-1', number: '1464', total: 300 },
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
  assert.equal(response.body.accessToken, 'raw-access-token');
});

test('клиент получает заказ по непредсказуемому идентификатору', async () => {
  const app = createApp({
    db,
    orderService: {
      get: async (id) =>
        id === 'order-1'
          ? { id, number: '1464', status: 'cooking', items: [] }
          : null,
    },
  });

  const found = await request(app).get('/api/orders/order-1');
  const missing = await request(app).get('/api/orders/missing');

  assert.equal(found.status, 200);
  assert.equal(found.body.status, 'cooking');
  assert.equal(missing.status, 404);
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
