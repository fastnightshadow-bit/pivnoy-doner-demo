import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerApi } from '../owner-api.js';
import { createKitchenApi } from '../kitchen-api.js';
import { createCourierApi } from '../courier-api.js';

const response = (body = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const recordingFetch = (calls, body = {}) => async (url, options = {}) => {
  calls.push({ url, options });
  return response(body);
};

test('смена статуса кухни отправляет актуальную версию заказа', async () => {
  const calls = [];
  const api = createKitchenApi({ fetchImpl: recordingFetch(calls) });

  await api.changeStatus('order-1', 'accepted', 3);

  assert.equal(calls[0].url, '/api/staff/orders/order-1/status');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    status: 'accepted',
    version: 3,
  });
});

test('курьер меняет статус только с версией заказа', async () => {
  const calls = [];
  const api = createCourierApi({ fetchImpl: recordingFetch(calls) });

  await api.changeStatus('order-1', 'courier', 4);

  assert.equal(calls[0].url, '/api/staff/orders/order-1/status');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    status: 'courier',
    version: 4,
  });
});

test('владелец может остановить приём заказов', async () => {
  const calls = [];
  const api = createOwnerApi({ fetchImpl: recordingFetch(calls) });

  await api.setAcceptingOrders(false);

  assert.equal(calls[0].url, '/api/owner/settings');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    acceptingOrders: false,
  });
});

test('владелец меняет только доступность, но не цену блюда', async () => {
  const calls = [];
  const api = createOwnerApi({ fetchImpl: recordingFetch(calls) });

  await api.setAvailability('classic-shawarma', false);

  assert.equal(calls[0].url, '/api/owner/catalog/classic-shawarma');
  assert.deepEqual(JSON.parse(calls[0].options.body), { available: false });
});

test('владелец меняет доступность категории одним запросом', async () => {
  const calls = [];
  const api = createOwnerApi({ fetchImpl: recordingFetch(calls) });

  await api.setCategoryAvailability('shawarma', false);

  assert.equal(calls[0].url, '/api/owner/categories/shawarma');
  assert.deepEqual(JSON.parse(calls[0].options.body), { available: false });
});

test('владелец может остановить отдельную добавку', async () => {
  const calls = [];
  const api = createOwnerApi({ fetchImpl: recordingFetch(calls) });

  await api.setOptionAvailability('addon', 'jalapeno', false);

  assert.equal(calls[0].url, '/api/catalog-options/addon/jalapeno');
  assert.deepEqual(JSON.parse(calls[0].options.body), { available: false });
});
