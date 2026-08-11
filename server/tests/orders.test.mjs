import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  deriveOrderAccessToken,
  hashOrderAccessToken,
  verifyOrderAccessToken,
} from '../src/domain/order-access.js';
import { priceOrder } from '../src/domain/pricing.js';
import { createOrderService } from '../src/services/orders.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const settings = Object.freeze({
  deliveryPrice: 200,
  freeDeliveryFrom: 2000,
  minimumOrder: 300,
});

test('order access token is opaque, deterministic for retries, and stored as a hash', () => {
  const input = {
    orderId: '0d7d410c-a81f-4d32-b719-547b72598a6d',
    idempotencyKey: 'checkout-123',
    secret: 'x'.repeat(32),
  };

  const first = deriveOrderAccessToken(input);
  const second = deriveOrderAccessToken(input);

  assert.equal(first, 'KZkL_Wgt8ZEzvTNj_o8ZLWuiQ8gDqgKjQt5pbFvBkD0');
  assert.equal(second, first);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    hashOrderAccessToken(first),
    '2889080ef4ddce20752a64930aa555d3dff2fef53a393591cfe88a6d93137c7d',
  );
});

test('order access token verification accepts the matching token and rejects invalid tokens', () => {
  const token = deriveOrderAccessToken({
    orderId: '0d7d410c-a81f-4d32-b719-547b72598a6d',
    idempotencyKey: 'checkout-123',
    secret: 'x'.repeat(32),
  });
  const expectedHash = hashOrderAccessToken(token);

  assert.equal(verifyOrderAccessToken(token, expectedHash), true);
  assert.equal(verifyOrderAccessToken('wrong', expectedHash), false);
  assert.equal(verifyOrderAccessToken('', expectedHash), false);
});

test('order access token verification rejects malformed stored hashes without throwing', () => {
  for (const expectedHash of [
    '',
    '0'.repeat(63),
    '0'.repeat(65),
    'g'.repeat(64),
    null,
    undefined,
  ]) {
    assert.equal(verifyOrderAccessToken('token', expectedHash), false);
  }
});

test('production access token config fails closed below 32 characters', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }),
    /ORDER_ACCESS_SECRET/,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        ORDER_ACCESS_SECRET: 'x'.repeat(31),
      }),
    /ORDER_ACCESS_SECRET/,
  );

  const production = loadConfig({
    NODE_ENV: 'production',
    ORDER_ACCESS_SECRET: 'x'.repeat(32),
  });
  assert.equal(production.orderAccessSecret, 'x'.repeat(32));

  assert.equal(loadConfig({ NODE_ENV: 'development' }).orderAccessSecret, '');
  assert.equal(loadConfig({ NODE_ENV: 'test' }).orderAccessSecret, '');
});

test('production access token config rejects a reused session secret', () => {
  const sharedSecret = 'shared-production-secret-value-123';

  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: sharedSecret,
        ORDER_ACCESS_SECRET: sharedSecret,
      }),
    (error) => {
      assert.match(
        error.message,
        /ORDER_ACCESS_SECRET must differ from SESSION_SECRET in production/,
      );
      assert.doesNotMatch(error.message, new RegExp(sharedSecret));
      return true;
    },
  );

  const production = loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: sharedSecret,
    ORDER_ACCESS_SECRET: 'distinct-order-access-secret-value',
  });
  assert.equal(
    production.orderAccessSecret,
    'distinct-order-access-secret-value',
  );

  assert.doesNotThrow(() =>
    loadConfig({
      NODE_ENV: 'development',
      SESSION_SECRET: sharedSecret,
      ORDER_ACCESS_SECRET: sharedSecret,
    }),
  );
});

const createRepository = () => {
  const byKey = new Map();
  return {
    findByIdempotencyKey: async (key) => byKey.get(key) ?? null,
    create: async (order) => {
      if (byKey.has(order.idempotencyKey)) {
        const error = new Error('unique violation');
        error.code = '23505';
        throw error;
      }
      byKey.set(order.idempotencyKey, order);
      return order;
    },
    size: () => byKey.size,
  };
};

test('сервер игнорирует цену клиента и считает две порции соуса', () => {
  const priced = priceOrder(
    {
      fulfillment: 'pickup',
      items: [
        {
          productId: 'nuggets',
          quantity: 1,
          unitPrice: 1,
          sauces: { tasty: 2 },
        },
      ],
    },
    settings,
  );

  assert.equal(priced.items[0].unitPrice, 300);
  assert.equal(priced.itemsTotal, 300);
  assert.equal(priced.total, 300);
});

test('доставка стоит 200 ₽ и бесплатна от 2 000 ₽', () => {
  const paidDelivery = priceOrder(
    {
      fulfillment: 'delivery',
      items: [{ productId: 'burger-standard', quantity: 1 }],
    },
    settings,
  );
  const freeDelivery = priceOrder(
    {
      fulfillment: 'delivery',
      items: [{ productId: 'burger-double', quantity: 4 }],
    },
    settings,
  );

  assert.equal(paidDelivery.deliveryTotal, 200);
  assert.equal(paidDelivery.total, 550);
  assert.equal(freeDelivery.deliveryTotal, 0);
  assert.equal(freeDelivery.total, 2000);
});

test('минимум 300 ₽ применяется только к доставке', () => {
  assert.doesNotThrow(() =>
    priceOrder(
      {
        fulfillment: 'pickup',
        items: [{ productId: 'sauce-tasty', quantity: 1 }],
      },
      settings,
    ),
  );
  assert.throws(
    () =>
      priceOrder(
        {
          fulfillment: 'delivery',
          items: [{ productId: 'nuggets', quantity: 1 }],
        },
        settings,
      ),
    /MINIMUM_ORDER/,
  );
});

test('повторный Idempotency-Key возвращает тот же заказ', async () => {
  const orders = createRepository();
  const orderService = createOrderService({ orders, settings });
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService,
  });
  const payload = {
    fulfillment: 'pickup',
    customer: { name: 'Илья', phone: '+7 (999) 123-45-67' },
    items: [{ productId: 'nuggets', quantity: 1 }],
  };

  const first = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'checkout-123')
    .send(payload);
  const second = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'checkout-123')
    .send(payload);

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.id, first.body.id);
  assert.equal(orders.size(), 1);
});

test('одновременные запросы с одним ключом создают один заказ', async () => {
  const stored = new Map();
  const orders = {
    findByIdempotencyKey: async (key) => stored.get(key) ?? null,
    create: async (order) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (stored.has(order.idempotencyKey)) {
        const error = new Error('unique violation');
        error.code = '23505';
        throw error;
      }
      stored.set(order.idempotencyKey, order);
      return order;
    },
  };
  const service = createOrderService({ orders, settings });
  const payload = {
    fulfillment: 'pickup',
    customer: { phone: '+7 (999) 123-45-67' },
    items: [{ productId: 'nuggets', quantity: 1 }],
  };

  const results = await Promise.all([
    service.create(payload, 'same-key-123'),
    service.create(payload, 'same-key-123'),
  ]);

  assert.equal(stored.size, 1);
  assert.equal(results[0].order.id, results[1].order.id);
});
