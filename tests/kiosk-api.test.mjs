import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDemoKioskApi,
  createKioskApi,
} from '../kiosk-api.js';

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('production API отправляет заказ один раз с ключом операции', async () => {
  const calls = [];
  const api = createKioskApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        order: {
          id: 'o1',
          number: '24',
          status: 'pending_payment',
          total: 760,
        },
        serverTime: '2026-08-23T12:00:00.000Z',
      });
    },
  });

  const result = await api.createOrder(
    { fulfillment: 'takeaway', lines: [] },
    'op-1',
  );

  assert.equal(calls[0].url, '/api/kiosk/orders');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'op-1');
  assert.equal(result.order.number, '24');
});

test('production API активирует планшет и проверяет оплату заказа', async () => {
  const calls = [];
  const api = createKioskApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(url.endsWith('/activate')
        ? { authenticated: true, device: { id: 'device-1' } }
        : { payment: { orderId: 'order-1', status: 'paid' } });
    },
  });

  await api.activateDevice('123456', 'Киоск у входа');
  const status = await api.getPaymentStatus('order-1');

  assert.equal(calls[0].url, '/api/kiosk/activate');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    code: '123456',
    displayName: 'Киоск у входа',
  });
  assert.equal(calls[1].url, '/api/kiosk/orders/order-1/payment');
  assert.equal(status.payment.status, 'paid');
});

test('production подписка передаёт обновление и состояние соединения', () => {
  let source;
  const events = [];
  const connections = [];
  const api = createKioskApi({
    fetchImpl: async () => jsonResponse({}),
    eventSourceFactory(url) {
      source = { url, closeCalled: false, close() { this.closeCalled = true; } };
      return source;
    },
  });

  const unsubscribe = api.subscribe(
    (event) => events.push(event),
    (connected) => connections.push(connected),
  );
  source.onopen();
  source.onmessage({ data: '{"type":"settings.updated","settings":{"acceptingOrders":false}}' });
  unsubscribe();

  assert.equal(source.url, '/api/kiosk/events');
  assert.deepEqual(connections, [true]);
  assert.deepEqual(events, [
    { type: 'settings.updated', settings: { acceptingOrders: false } },
  ]);
  assert.equal(source.closeCalled, true);
});

test('demo bootstrap использует существующее меню и пустой стоп-лист', async () => {
  const api = createDemoKioskApi({
    delay: async () => {},
    now: () => Date.parse('2026-08-23T12:00:00.000Z'),
  });

  const result = await api.getBootstrap();

  assert.ok(result.products.length > 0);
  assert.equal(result.products.some(({ id }) => id === 'classic-shawarma'), true);
  assert.deepEqual(result.settings, {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  });
  assert.equal(result.serverTime, '2026-08-23T12:00:00.000Z');
});

test('demo API возвращает тот же заказ при повторе ключа операции', async () => {
  let nowValue = Date.parse('2026-08-23T12:00:00.000Z');
  const api = createDemoKioskApi({
    delay: async () => {},
    now: () => nowValue,
  });
  const payload = {
    fulfillment: 'dine-in',
    lines: [{ productId: 'classic-shawarma', quantity: 1, unitPrice: 300 }],
  };

  const first = await api.createOrder(payload, 'order-op-1');
  nowValue += 10_000;
  const second = await api.createOrder(payload, 'order-op-1');

  assert.deepEqual(second, first);
  assert.equal(first.order.total, 300);
  assert.equal(first.order.status, 'pending_payment');
});
