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
import { createOrdersRepository } from '../src/repositories/orders.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LEGAL_VERSIONS } from '../../shared/legal.js';

const settings = Object.freeze({
  deliveryPrice: 200,
  freeDeliveryFrom: 2000,
  minimumOrder: 300,
});

const currentConsent = Object.freeze({
  personalDataConsent: true,
  personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
  offerVersion: LEGAL_VERSIONS.offer,
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
  let createCalls = 0;
  return {
    findByIdempotencyKey: async (key) => byKey.get(key) ?? null,
    findById: async (id) =>
      [...byKey.values()].find((order) => order.id === id) ?? null,
    create: async (order) => {
      createCalls += 1;
      if (byKey.has(order.idempotencyKey)) {
        const error = new Error('unique violation');
        error.code = '23505';
        throw error;
      }
      byKey.set(order.idempotencyKey, order);
      return order;
    },
    size: () => byKey.size,
    createCalls: () => createCalls,
  };
};

const validOrderPayload = () => ({
  fulfillment: 'pickup',
  customer: { name: 'Ilya', phone: '+7 (999) 123-45-67' },
  items: [{ productId: 'nuggets', quantity: 1 }],
  ...currentConsent,
});

test('новый заказ со стоп-листом отклоняется до сохранения', async () => {
  const orders = createRepository();
  const service = createOrderService({
    orders,
    settings,
    catalogSettings: {
      get: async () => ({ stoppedProductIds: ['nuggets'] }),
    },
    orderAccessSecret: 'test-order-access-secret',
  });

  await assert.rejects(
    () => service.create(validOrderPayload(), 'stopped-product-1'),
    (error) => {
      assert.equal(error.code, 'PRODUCT_UNAVAILABLE');
      assert.deepEqual(error.details, { productIds: ['nuggets'] });
      return true;
    },
  );
  assert.equal(orders.size(), 0);
  assert.equal(orders.createCalls(), 0);
});

test('HTTP сообщает клиенту конкретные товары из стоп-листа', async () => {
  const orders = createRepository();
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: createOrderService({
      orders,
      settings,
      catalogSettings: {
        get: async () => ({ stoppedProductIds: ['nuggets'] }),
      },
      orderAccessSecret: 'test-order-access-secret',
    }),
  });

  const response = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'stopped-product-http')
    .send(validOrderPayload());

  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'PRODUCT_UNAVAILABLE');
  assert.deepEqual(response.body.details, { productIds: ['nuggets'] });
});

test('order without consent is rejected', async () => {
  const orders = createRepository();
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: createOrderService({
      orders,
      settings,
      orderAccessSecret: 'test-order-access-secret',
    }),
  });

  for (const personalDataConsent of [false, undefined]) {
    const payload = validOrderPayload();
    if (personalDataConsent === undefined) {
      delete payload.personalDataConsent;
    } else {
      payload.personalDataConsent = personalDataConsent;
    }

    const response = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', `consent-${String(personalDataConsent)}`)
      .send(payload);

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'PERSONAL_DATA_CONSENT_REQUIRED');
  }
  assert.equal(orders.size(), 0);
});

test('stale legal versions are rejected before pricing', async () => {
  const orders = createRepository();
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: createOrderService({
      orders,
      settings,
      orderAccessSecret: 'test-order-access-secret',
    }),
  });

  const response = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'stale-legal-versions')
    .send({
      ...validOrderPayload(),
      personalDataConsentVersion: '2026-01-01',
      offerVersion: '2026-01-01',
      items: [{ productId: 'not-a-real-product', quantity: 1 }],
    });

  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'LEGAL_VERSION_OUTDATED');
  assert.equal(orders.size(), 0);
});

test('stale legal versions on an Idempotency retry are rejected before lookup and pricing', async () => {
  const orders = createRepository();
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: createOrderService({
      orders,
      settings,
      createId: () => 'existing-consent-order',
      orderAccessSecret: 'test-order-access-secret',
    }),
  });

  const first = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'stale-retry-key')
    .send(validOrderPayload());
  const staleRetry = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'stale-retry-key')
    .send({
      ...validOrderPayload(),
      personalDataConsentVersion: '2026-01-01',
      offerVersion: '2026-01-01',
      items: [{ productId: 'not-a-real-product', quantity: 1 }],
    });

  assert.equal(first.status, 201);
  assert.equal(staleRetry.status, 409);
  assert.equal(staleRetry.body.error, 'LEGAL_VERSION_OUTDATED');
  assert.equal(orders.size(), 1);
  assert.equal(orders.createCalls(), 1);
});

test('current consent and injected time are persisted with only the token hash', async () => {
  const orders = createRepository();
  const createdAt = new Date('2026-08-11T12:34:56.000Z');
  const service = createOrderService({
    orders,
    settings,
    createId: () => 'order-consent-1',
    now: () => createdAt,
    orderAccessSecret: 'test-order-access-secret',
  });

  const result = await service.create(validOrderPayload(), 'consent-save-1');
  const stored = await orders.findByIdempotencyKey('consent-save-1');

  assert.equal(result.created, true);
  assert.equal(result.order.id, 'order-consent-1');
  assert.match(result.accessToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(stored.personalDataConsentAt, createdAt.toISOString());
  assert.equal(
    stored.personalDataConsentVersion,
    LEGAL_VERSIONS.personalDataConsent,
  );
  assert.equal(stored.offerVersion, LEGAL_VERSIONS.offer);
  assert.equal(stored.accessTokenHash, hashOrderAccessToken(result.accessToken));
  assert.equal(Object.hasOwn(stored, 'accessToken'), false);
});

test('repository inserts and maps consent proof without a raw access token', async () => {
  const queries = [];
  const row = {
    id: 'order-1',
    public_number: 1464,
    idempotency_key: 'repository-consent-1',
    status: 'submitted',
    payment_status: 'pending',
    fulfillment: 'pickup',
    customer_name: 'Ilya',
    phone: '+79991234567',
    address: {},
    customer_comment: '',
    courier_comment: '',
    items_total: 300,
    delivery_total: 0,
    discount_total: 0,
    total: 300,
    eta_min: 8,
    eta_max: 12,
    version: 1,
    created_at: '2026-08-11T12:34:56.000Z',
    personal_data_consent_at: '2026-08-11T12:34:56.000Z',
    personal_data_consent_version: LEGAL_VERSIONS.personalDataConsent,
    offer_version: LEGAL_VERSIONS.offer,
    access_token_hash: 'a'.repeat(64),
  };
  const client = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      if (String(sql).includes('returning *')) return { rows: [row] };
      return { rows: [] };
    },
    release: () => {},
  };
  const repository = createOrdersRepository({ connect: async () => client });

  const created = await repository.create({
    id: row.id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    fulfillment: row.fulfillment,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    phone: row.phone,
    address: row.address,
    customerComment: row.customer_comment,
    courierComment: row.courier_comment,
    itemsTotal: row.items_total,
    deliveryTotal: row.delivery_total,
    discountTotal: row.discount_total,
    total: row.total,
    eta: { min: row.eta_min, max: row.eta_max },
    version: row.version,
    createdAt: row.created_at,
    personalDataConsentAt: row.personal_data_consent_at,
    personalDataConsentVersion: row.personal_data_consent_version,
    offerVersion: row.offer_version,
    accessTokenHash: row.access_token_hash,
    items: [],
  });

  const insert = queries.find(({ sql }) => String(sql).includes('insert into orders'));
  assert.match(insert.sql, /personal_data_consent_at/);
  assert.match(insert.sql, /personal_data_consent_version/);
  assert.match(insert.sql, /offer_version/);
  assert.match(insert.sql, /access_token_hash/);
  assert.deepEqual(insert.values.slice(-4), [
    row.personal_data_consent_at,
    row.personal_data_consent_version,
    row.offer_version,
    row.access_token_hash,
  ]);
  assert.equal(created.personalDataConsentAt, row.personal_data_consent_at);
  assert.equal(created.accessTokenHash, row.access_token_hash);
  assert.equal(Object.hasOwn(created, 'accessToken'), false);
});

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
  const orderService = createOrderService({
    orders,
    settings,
    orderAccessSecret: 'test-order-access-secret',
  });
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService,
  });
  const payload = {
    fulfillment: 'pickup',
    customer: { name: 'Илья', phone: '+7 (999) 123-45-67' },
    items: [{ productId: 'nuggets', quantity: 1 }],
    ...currentConsent,
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
  assert.equal(second.body.accessToken, first.body.accessToken);
  assert.equal(orders.size(), 1);
});

test('idempotent creation retry rejects a token that the rotated secret cannot recover', async () => {
  const idempotencyKey = 'rotated-secret-retry';
  const orderId = 'rotated-secret-order';
  const originalToken = deriveOrderAccessToken({
    orderId,
    idempotencyKey,
    secret: 'original-order-access-secret',
  });
  const existing = {
    id: orderId,
    number: '1464',
    idempotencyKey,
    status: 'submitted',
    paymentStatus: 'pending',
    fulfillment: 'pickup',
    itemsTotal: 300,
    deliveryTotal: 0,
    discountTotal: 0,
    total: 300,
    eta: { min: 8, max: 12 },
    version: 1,
    createdAt: '2026-08-12T12:00:00.000Z',
    accessTokenHash: hashOrderAccessToken(originalToken),
    items: [
      {
        lineId: 'line-1',
        productId: 'nuggets',
        name: 'Наггетсы',
        quantity: 1,
        unitPrice: 300,
        configuration: {
          meat: 'default',
          size: 'single',
          addons: {},
          sauces: {},
        },
      },
    ],
  };
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: createOrderService({
      orders: {
        findByIdempotencyKey: async () => ({ ...existing, items: undefined }),
        findById: async () => existing,
        create: async () => assert.fail('must not create a duplicate order'),
      },
      settings,
      orderAccessSecret: 'rotated-order-access-secret',
    }),
  });

  const response = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', idempotencyKey)
    .send(validOrderPayload());

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    error: 'ORDER_ACCESS_TOKEN_UNAVAILABLE',
    details: {},
  });
  assert.equal(Object.hasOwn(response.body, 'accessToken'), false);
});

test('idempotent creation retry reloads the original item-aware public representation', async () => {
  const idempotencyKey = 'item-aware-retry';
  const orderAccessSecret = 'item-aware-order-access-secret';
  const existing = {
    id: 'item-aware-order',
    number: '2468',
    idempotencyKey,
    status: 'submitted',
    paymentStatus: 'pending',
    fulfillment: 'pickup',
    itemsTotal: 300,
    deliveryTotal: 0,
    discountTotal: 0,
    total: 300,
    eta: { min: 8, max: 12 },
    version: 1,
    createdAt: '2026-08-12T12:00:00.000Z',
    items: [
      {
        lineId: 'line-1',
        productId: 'nuggets',
        name: 'Наггетсы',
        quantity: 1,
        unitPrice: 300,
        configuration: {
          meat: 'default',
          size: 'single',
          addons: {},
          sauces: { tasty: 2 },
        },
      },
    ],
  };
  const accessToken = deriveOrderAccessToken({
    orderId: existing.id,
    idempotencyKey,
    secret: orderAccessSecret,
  });
  existing.accessTokenHash = hashOrderAccessToken(accessToken);
  let itemAwareReads = 0;
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: createOrderService({
      orders: {
        findByIdempotencyKey: async () => ({ ...existing, items: undefined }),
        findById: async (id) => {
          itemAwareReads += 1;
          return id === existing.id ? existing : null;
        },
        create: async () => assert.fail('must not create a duplicate order'),
      },
      settings,
      orderAccessSecret,
    }),
  });

  const response = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', idempotencyKey)
    .send(validOrderPayload());

  assert.equal(response.status, 200);
  assert.equal(itemAwareReads, 1);
  assert.equal(response.body.accessToken, accessToken);
  assert.deepEqual(response.body.items, [
    {
      lineId: 'line-1',
      productId: 'nuggets',
      name: 'Наггетсы',
      quantity: 1,
      unitPrice: 300,
      meat: 'default',
      size: 'single',
      addons: {},
      sauces: { tasty: 2 },
    },
  ]);
});

test('одновременные запросы с одним ключом создают один заказ', async () => {
  const stored = new Map();
  const orders = {
    findByIdempotencyKey: async (key) => stored.get(key) ?? null,
    findById: async (id) =>
      [...stored.values()].find((order) => order.id === id) ?? null,
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
  const service = createOrderService({
    orders,
    settings,
    orderAccessSecret: 'test-order-access-secret',
  });
  const payload = {
    fulfillment: 'pickup',
    customer: { phone: '+7 (999) 123-45-67' },
    items: [{ productId: 'nuggets', quantity: 1 }],
    ...currentConsent,
  };

  const results = await Promise.all([
    service.create(payload, 'same-key-123'),
    service.create(payload, 'same-key-123'),
  ]);

  assert.equal(stored.size, 1);
  assert.equal(results[0].order.id, results[1].order.id);
  assert.equal(results[0].accessToken, results[1].accessToken);
  assert.deepEqual(
    results.map(({ created }) => created).sort(),
    [false, true],
  );
  assert.equal(
    stored.get('same-key-123').accessTokenHash,
    hashOrderAccessToken(results[0].accessToken),
  );
});
