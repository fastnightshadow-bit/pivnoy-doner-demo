import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoCourierApi } from '../courier-api.js';

test('демо-курьер входит только по своему PIN', async () => {
  const api = createDemoCourierApi({ delay: async () => {} });
  await assert.rejects(api.login('0000'), /Неверный PIN/);
  assert.deepEqual(await api.login('5724'), { courier: { name: 'Курьер' } });
});

test('API курьера отдаёт только подтверждённые доставки', async () => {
  const api = createDemoCourierApi({ delay: async () => {}, now: () => Date.parse('2026-08-05T10:00:00.000Z') });
  await api.login('5724');
  const { orders } = await api.getOrders();
  assert.ok(orders.length > 0);
  assert.ok(orders.every(({ fulfillment, status }) =>
    fulfillment === 'delivery' && status !== 'new'));
});
