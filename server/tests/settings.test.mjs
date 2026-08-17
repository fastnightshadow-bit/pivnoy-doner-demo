import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const db = { query: async () => ({ rows: [{ ok: 1 }] }) };
const authService = {
  authenticate: async (token) => {
    if (token === 'owner') return { id: 'owner-1', role: 'owner', displayName: 'Павел' };
    if (token === 'kitchen') return { id: 'kitchen-1', role: 'kitchen', displayName: 'Кухня' };
    if (token === 'courier') return { id: 'courier-1', role: 'courier', displayName: 'Курьер' };
    return null;
  },
};

test('клиент без входа получает только публичное состояние каталога', async () => {
  const settingsService = {
    get: async () => ({
      acceptingOrders: false,
      stoppedProductIds: ['tasty-shawarma'],
      stoppedMeatIds: ['beef'],
      stoppedSauceIds: ['tasty'],
      deliveryPrice: 200,
      internalNote: 'не публиковать',
    }),
  };
  const app = createApp({ db, authService, settingsService });

  const response = await request(app).get('/api/catalog-status');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    acceptingOrders: false,
    stoppedProductIds: ['tasty-shawarma'],
    stoppedMeatIds: ['beef'],
    stoppedSauceIds: ['tasty'],
  });
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('публичный endpoint каталога работает только на чтение', async () => {
  const app = createApp({
    db,
    authService,
    settingsService: {
      get: async () => ({ acceptingOrders: true, stoppedProductIds: [] }),
    },
  });

  const response = await request(app)
    .patch('/api/catalog-status')
    .send({ stoppedProductIds: ['nuggets'] });

  assert.equal(response.status, 404);
});

test('кухня может остановить приём заказов и поставить блюдо в стоп-лист', async () => {
  const updates = [];
  const settingsService = {
    get: async () => ({ acceptingOrders: true, stoppedProductIds: [] }),
    update: async (value, account) => {
      updates.push({ value, account });
      return value;
    },
    setAvailability: async (productId, available, account) => {
      updates.push({ productId, available, account });
      return { productId, available };
    },
  };
  const app = createApp({ db, authService, settingsService });

  const settings = await request(app)
    .patch('/api/settings')
    .set('Cookie', 'pivdoner_session=kitchen')
    .send({ acceptingOrders: false });
  const product = await request(app)
    .patch('/api/catalog/classic-shawarma')
    .set('Cookie', 'pivdoner_session=kitchen')
    .send({ available: false });

  assert.equal(settings.status, 200);
  assert.equal(product.status, 200);
  assert.equal(updates.length, 2);
});

test('кухня отдельно останавливает курицу, говядину и соусы', async () => {
  const updates = [];
  const settingsService = {
    get: async () => ({
      acceptingOrders: true,
      stoppedProductIds: [],
      stoppedMeatIds: [],
      stoppedSauceIds: [],
    }),
    setOptionAvailability: async (kind, optionId, available, account) => {
      updates.push({ kind, optionId, available, account });
      return { kind, optionId, available };
    },
  };
  const app = createApp({ db, authService, settingsService });

  const chicken = await request(app)
    .patch('/api/catalog-options/meat/chicken')
    .set('Cookie', 'pivdoner_session=kitchen')
    .send({ available: false });
  const sauce = await request(app)
    .patch('/api/catalog-options/sauce/tasty')
    .set('Cookie', 'pivdoner_session=kitchen')
    .send({ available: false });

  assert.equal(chicken.status, 200);
  assert.equal(sauce.status, 200);
  assert.deepEqual(
    updates.map(({ kind, optionId, available }) => ({ kind, optionId, available })),
    [
      { kind: 'meat', optionId: 'chicken', available: false },
      { kind: 'sauce', optionId: 'tasty', available: false },
    ],
  );
});

test('неизвестную опцию нельзя добавить в стоп-лист', async () => {
  const error = Object.assign(new Error('OPTION_NOT_FOUND'), {
    code: 'OPTION_NOT_FOUND',
    status: 404,
  });
  const app = createApp({
    db,
    authService,
    settingsService: {
      setOptionAvailability: async () => {
        throw error;
      },
    },
  });

  const response = await request(app)
    .patch('/api/catalog-options/sauce/unknown')
    .set('Cookie', 'pivdoner_session=kitchen')
    .send({ available: false });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'OPTION_NOT_FOUND');
});

test('курьер не может менять стоп-лист мяса и соусов', async () => {
  const app = createApp({
    db,
    authService,
    settingsService: { setOptionAvailability: async () => ({}) },
  });

  const response = await request(app)
    .patch('/api/catalog-options/meat/beef')
    .set('Cookie', 'pivdoner_session=courier')
    .send({ available: false });

  assert.equal(response.status, 403);
});

test('курьер не может менять настройки ресторана', async () => {
  const app = createApp({
    db,
    authService,
    settingsService: {
      get: async () => ({}),
      update: async () => ({}),
      setAvailability: async () => ({}),
    },
  });

  const response = await request(app)
    .patch('/api/settings')
    .set('Cookie', 'pivdoner_session=courier')
    .send({ acceptingOrders: false });

  assert.equal(response.status, 403);
});

test('панель владельца недоступна кухне', async () => {
  const app = createApp({
    db,
    authService,
    dashboardService: { get: async () => ({ activeOrders: 2 }) },
  });

  const denied = await request(app)
    .get('/api/owner/dashboard')
    .set('Cookie', 'pivdoner_session=kitchen');
  const allowed = await request(app)
    .get('/api/owner/dashboard')
    .set('Cookie', 'pivdoner_session=owner');

  assert.equal(denied.status, 403);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.activeOrders, 2);
});
