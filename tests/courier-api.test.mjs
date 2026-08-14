import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourierApi, createDemoCourierApi } from '../courier-api.js';
import { readText } from './helpers.mjs';

const response = (body = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('courier restores an existing secure server session without a PIN', async () => {
  const api = createCourierApi({
    fetchImpl: async () =>
      response({
        authenticated: true,
        account: { id: 'courier', displayName: 'Курьер', role: 'courier' },
      }),
  });

  assert.deepEqual(await api.getSession(), {
    courier: { name: 'Курьер' },
  });
});

test('courier reports an expired session as null', async () => {
  const api = createCourierApi({
    fetchImpl: async () => response({ authenticated: false }),
  });
  assert.equal(await api.getSession(), null);
});

test('courier keeps status conflict metadata for safe recovery', async () => {
  const api = createCourierApi({
    fetchImpl: async () =>
      response(
        {
          error: 'STATUS_CONFLICT',
          message: 'Заказ уже изменён',
          details: { currentVersion: 5 },
        },
        409,
      ),
  });

  await assert.rejects(api.changeStatus('order-1', 'courier', 4), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'STATUS_CONFLICT');
    assert.deepEqual(error.details, { currentVersion: 5 });
    return true;
  });
});

test('courier subscribes to staff order and payment events', () => {
  const listeners = new Map();
  const events = [];
  const source = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    close: () => {},
  };
  const api = createCourierApi({ eventSourceFactory: () => source });

  api.subscribe((event) => events.push(event));
  listeners.get('payment.updated')({ data: JSON.stringify({ orderId: 'order-1' }) });

  assert.equal(events[0].type, 'sync.required');
  assert.equal(events[0].sourceType, 'payment.updated');
});

test('демо-курьер входит только по своему PIN', async () => {
  const api = createDemoCourierApi({ delay: async () => {} });
  await assert.rejects(api.login('5724'), /Неверный PIN/);
  assert.deepEqual(await api.login('0000'), { courier: { name: 'Павел' } });
});

test('PIN курьера не написан на странице входа', () => {
  const html = readText('courier.html');
  assert.doesNotMatch(html, /0000|5724|Демо-PIN/);
  assert.match(html, /data-courier-name/);
});

test('API курьера отдаёт только подтверждённые доставки', async () => {
  const api = createDemoCourierApi({ delay: async () => {}, now: () => Date.parse('2026-08-05T10:00:00.000Z') });
  await api.login('0000');
  const { orders } = await api.getOrders();
  assert.ok(orders.length > 0);
  assert.ok(orders.every(({ fulfillment, status }) =>
    fulfillment === 'delivery' && status !== 'new'));
  assert.ok(orders.every(({ address }) =>
    address.entrance && address.floor && address.apartment && address.intercom));
});

test('демо-курьер принимает и завершает готовую доставку', async () => {
  const api = createDemoCourierApi({
    delay: async () => {},
    now: () => Date.parse('2026-08-05T10:00:00.000Z'),
  });
  await api.login('0000');
  const ready = (await api.getOrders()).orders.find(({ status }) => status === 'ready');
  assert.ok(ready);

  const accepted = await api.changeStatus(ready.id, 'courier', ready.version);
  assert.equal(accepted.order.status, 'handed_to_courier');

  const completed = await api.changeStatus(
    ready.id,
    'completed',
    accepted.order.version,
  );
  assert.equal(completed.order.status, 'completed');
  assert.equal(
    (await api.getOrders()).orders.some(({ id }) => id === ready.id),
    false,
  );
});
