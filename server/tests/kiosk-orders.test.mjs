import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createKioskOrderService } from '../src/services/kiosk-orders.js';
import { DEFAULT_ORDER_SETTINGS } from '../src/domain/delivery.js';
import { LEGAL_VERSIONS } from '../../shared/legal.js';

const createOrders = () => {
  const byKey = new Map();
  return {
    findByIdempotencyKey: async (key) => byKey.get(key) ?? null,
    findById: async (id) => [...byKey.values()].find((order) => order.id === id) ?? null,
    create: async (order) => {
      byKey.set(order.idempotencyKey, order);
      return { ...order, number: '31' };
    },
  };
};

const createService = ({ catalog = {}, orders = createOrders() } = {}) =>
  createKioskOrderService({
    orders,
    settings: DEFAULT_ORDER_SETTINGS,
    catalogSettings: { get: async () => ({ acceptingOrders: true, ...catalog }) },
    createId: () => 'c81f9510-8589-4eac-bdbe-fb190d2b04bd',
    now: () => new Date('2026-08-30T12:00:00.000Z'),
  });

const validInput = () => ({
  serviceMode: 'dine_in',
  fiscalPhone: '+7 999 123-45-67',
  personalDataConsent: true,
  personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
  offerVersion: LEGAL_VERSIONS.offer,
  items: [{ productId: 'nuggets', quantity: 1, unitPrice: 1 }],
});

test('киоск создаёт заказ с серверной ценой и сохраняет источник и режим', async () => {
  const service = createService();
  const result = await service.create(
    validInput(),
    'kiosk-order-operation-1',
    { id: 'device-1', displayName: 'Планшет у входа' },
  );

  assert.equal(result.created, true);
  assert.equal(result.order.total, 200);
  assert.equal(result.order.source, 'kiosk');
  assert.equal(result.order.serviceMode, 'dine_in');
  assert.equal(result.order.kioskDeviceId, 'device-1');
  assert.equal(result.order.fulfillment, 'pickup');
  assert.equal(result.order.phone, '+7 999 123-45-67');
  assert.equal(result.order.accessTokenHash, null);
});

test('киоск не создаёт заказ из товара в стоп-листе', async () => {
  const service = createService({ catalog: { stoppedProductIds: ['nuggets'] } });

  await assert.rejects(
    () => service.create(validInput(), 'kiosk-order-operation-2', { id: 'device-1' }),
    (error) => error.code === 'PRODUCT_UNAVAILABLE',
  );
});

test('повтор ключа операции разрешён только тому же киоску', async () => {
  const service = createService();
  await service.create(validInput(), 'kiosk-order-operation-3', { id: 'device-1' });
  const retry = await service.create(
    validInput(),
    'kiosk-order-operation-3',
    { id: 'device-1' },
  );
  assert.equal(retry.created, false);

  await assert.rejects(
    () => service.create(validInput(), 'kiosk-order-operation-3', { id: 'device-2' }),
    (error) => error.code === 'IDEMPOTENCY_KEY_CONFLICT',
  );
});

test('неподключённый планшет не видит меню и не создаёт заказ', async () => {
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    kioskAuthService: { authenticate: async () => null },
    kioskOrderService: createService(),
    settingsService: { get: async () => ({ acceptingOrders: true }) },
  });

  assert.equal((await request(app).get('/api/kiosk/bootstrap')).status, 401);
  assert.equal(
    (await request(app)
      .post('/api/kiosk/orders')
      .set('Idempotency-Key', 'kiosk-http-operation-1')
      .send(validInput())).status,
    401,
  );
});

test('подключённый планшет получает каноническое меню и создаёт заказ', async () => {
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    kioskAuthService: {
      authenticate: async (token) => token === 'valid-token'
        ? { id: 'device-1', displayName: 'Киоск 1' }
        : null,
    },
    kioskOrderService: createService(),
    settingsService: { get: async () => ({ acceptingOrders: true }) },
  });

  const bootstrap = await request(app)
    .get('/api/kiosk/bootstrap')
    .set('Cookie', 'pivdoner_kiosk=valid-token');
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.products.some(({ id }) => id === 'classic-shawarma'), true);

  const response = await request(app)
    .post('/api/kiosk/orders')
    .set('Cookie', 'pivdoner_kiosk=valid-token')
    .set('Idempotency-Key', 'kiosk-http-operation-2')
    .send(validInput());

  assert.equal(response.status, 201);
  assert.equal(response.body.order.total, 200);
  assert.equal(response.body.order.source, 'kiosk');
  assert.equal(response.body.order.serviceMode, 'dine_in');
});

test('QR-заказ возвращает реальную ссылку оплаты и SVG, но не секреты', async () => {
  const paymentCalls = [];
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    kioskAuthService: {
      authenticate: async () => ({ id: 'device-1', displayName: 'Киоск 1' }),
    },
    kioskOrderService: createService(),
    settingsService: { get: async () => ({ acceptingOrders: true }) },
    paymentService: {
      createForKiosk: async (orderId, key, deviceId) => {
        paymentCalls.push({ orderId, key, deviceId });
        return {
          id: 'payment-1',
          orderId,
          status: 'pending',
          confirmationUrl: 'https://yoomoney.ru/checkout/payments/sbp/1',
        };
      },
    },
    kioskQrEncoder: async (value) => `<svg data-value="${value}"></svg>`,
  });

  const response = await request(app)
    .post('/api/kiosk/orders')
    .set('Cookie', 'pivdoner_kiosk=valid-token')
    .set('Idempotency-Key', 'kiosk-http-operation-qr')
    .send(validInput());

  assert.equal(response.status, 201);
  assert.equal(response.body.payment.status, 'pending');
  assert.match(response.body.qrSvg, /^<svg/);
  assert.deepEqual(paymentCalls, [{
    orderId: 'c81f9510-8589-4eac-bdbe-fb190d2b04bd',
    key: 'kiosk-http-operation-qr:sbp',
    deviceId: 'device-1',
  }]);
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
});

test('киоск автоматически получает подтверждённый статус оплаты своего заказа', async () => {
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    kioskAuthService: {
      authenticate: async () => ({ id: 'device-1', displayName: 'Киоск 1' }),
    },
    kioskOrderService: createService(),
    settingsService: { get: async () => ({ acceptingOrders: true }) },
    paymentService: {
      createForKiosk: async () => null,
      getForKiosk: async (orderId, deviceId) => ({
        id: 'payment-1',
        orderId,
        status: deviceId === 'device-1' ? 'paid' : 'pending',
        confirmationUrl: '',
      }),
    },
  });

  const response = await request(app)
    .get('/api/kiosk/orders/order-1/payment')
    .set('Cookie', 'pivdoner_kiosk=valid-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.payment.status, 'paid');
  assert.equal(response.body.payment.orderId, 'order-1');
});
