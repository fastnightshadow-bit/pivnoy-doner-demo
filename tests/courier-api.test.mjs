import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoCourierApi } from '../courier-api.js';
import { readText } from './helpers.mjs';

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
