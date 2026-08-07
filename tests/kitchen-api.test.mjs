import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoKitchenApi } from '../kitchen-api.js';
import { readText } from './helpers.mjs';

const createApi = () =>
  createDemoKitchenApi({ delay: async () => {}, now: () => Date.parse('2026-08-05T10:00:00.000Z') });

test('демо-кухня использует один общий аккаунт для двух поваров', async () => {
  const api = createApi();
  await assert.rejects(api.login('2468'), /Неверный PIN/);
  assert.deepEqual(await api.login('0000'), {
    employee: { id: 'kitchen', name: 'Кухня' },
    shift: '2 повара',
  });
});

test('изменение статуса записывается от имени кухни', async () => {
  const api = createApi();
  await api.login('0000');
  const { orders } = await api.getBoard();
  const order = orders.find(({ status }) => status === 'new');
  const { order: updated } = await api.changeStatus(
    order.id,
    'accepted',
    'operation-accept-1',
  );
  assert.equal(updated.employee, 'Кухня');
  assert.equal(updated.history.at(-1).employee, 'Кухня');
});

test('демо-API сохраняет приём заказов и стоп-лист', async () => {
  const api = createApi();
  await api.login('0000');
  assert.deepEqual(await api.getSettings(), {
    acceptingOrders: true,
    stoppedProductIds: [],
  });
  assert.deepEqual(
    await api.updateSettings(
      {
        acceptingOrders: false,
        stoppedProductIds: ['classic-shawarma'],
      },
      'operation-settings-1',
    ),
    {
      acceptingOrders: false,
      stoppedProductIds: ['classic-shawarma'],
    },
  );
});

test('экран кухни показывает общие настройки без публичного PIN', () => {
  const html = readText('kitchen.html');
  const portal = readText('index.html');
  assert.doesNotMatch(html, /0000|Личный PIN|Демо-PIN/);
  assert.doesNotMatch(portal, /0000|2468|PIN\s*\d{4}/);
  assert.match(html, /data-kitchen-settings-open/);
  assert.match(html, /data-accepting-orders/);
  assert.match(html, /data-stop-list/);
  assert.match(html, />Выйти</);
});
