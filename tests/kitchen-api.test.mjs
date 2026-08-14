import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoKitchenApi, createKitchenApi } from '../kitchen-api.js';
import { getKitchenPresentation } from '../kitchen-presentation.js';
import { readText } from './helpers.mjs';

const createApi = () =>
  createDemoKitchenApi({ delay: async () => {}, now: () => Date.parse('2026-08-05T10:00:00.000Z') });

const response = (body = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('kitchen restores an existing secure server session without a PIN', async () => {
  const calls = [];
  const api = createKitchenApi({
    fetchImpl: async (url) => {
      calls.push(url);
      return response({
        authenticated: true,
        account: { id: 'kitchen', displayName: 'Кухня', role: 'kitchen' },
      });
    },
  });

  assert.deepEqual(await api.getSession(), {
    employee: { id: 'kitchen', name: 'Кухня' },
    shift: '2 повара',
  });
  assert.deepEqual(calls, ['/api/auth/session']);
});

test('kitchen reports an expired session as null', async () => {
  const api = createKitchenApi({
    fetchImpl: async () => response({ authenticated: false }),
  });
  assert.equal(await api.getSession(), null);
});

test('kitchen keeps status conflict metadata for safe recovery', async () => {
  const api = createKitchenApi({
    fetchImpl: async () =>
      response(
        {
          error: 'STATUS_CONFLICT',
          message: 'Заказ уже изменён',
          details: { currentVersion: 7 },
        },
        409,
      ),
  });

  await assert.rejects(api.changeStatus('order-1', 'cooking', 6), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'STATUS_CONFLICT');
    assert.deepEqual(error.details, { currentVersion: 7 });
    return true;
  });
});

test('kitchen synchronizes when an order payment becomes successful', () => {
  const listeners = new Map();
  const events = [];
  const source = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    close: () => {},
  };
  const api = createKitchenApi({ eventSourceFactory: () => source });

  api.subscribe((event) => events.push(event));
  listeners.get('payment.updated')({
    data: JSON.stringify({ orderId: 'order-1', paymentStatus: 'paid' }),
  });

  assert.equal(events[0].type, 'sync.required');
  assert.equal(events[0].sourceType, 'payment.updated');
});

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

test('кухня на телефоне показывает одну рабочую колонку и переключатель статусов', () => {
  const html = readText('kitchen.html');
  const css = readText('kitchen.css');

  assert.deepEqual(getKitchenPresentation({ width: 390, height: 844 }), {
    mode: 'phone',
    scale: 1,
  });
  assert.match(html, /data-mobile-columns/);
  assert.equal((html.match(/data-mobile-column="/g) || []).length, 4);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.kanban-column:not\(\.is-current\)\s*\{\s*display:\s*none;/s);
});
