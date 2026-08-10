import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { priceOrder } from '../src/domain/pricing.js';
import { createOrderService } from '../src/services/orders.js';
import { createApp } from '../src/app.js';

const settings = Object.freeze({
  deliveryPrice: 200,
  freeDeliveryFrom: 2000,
  minimumOrder: 300,
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
