import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDemoKitchenApi,
  createKitchenApi,
  normalizeProductionKitchenOrder,
} from '../kitchen-api.js';
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
    stoppedMeatIds: [],
    stoppedSauceIds: [],
  });
  assert.deepEqual(
    await api.updateSettings(
      {
        acceptingOrders: false,
        stoppedProductIds: ['classic-shawarma'],
        stoppedMeatIds: ['beef'],
        stoppedSauceIds: ['tasty'],
      },
      'operation-settings-1',
    ),
    {
      acceptingOrders: false,
      stoppedProductIds: ['classic-shawarma'],
      stoppedMeatIds: ['beef'],
      stoppedSauceIds: ['tasty'],
    },
  );
});

test('production kitchen saves stopped meats and sauces through option endpoints', async () => {
  const calls = [];
  const api = createKitchenApi({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });
      return response({
        acceptingOrders: true,
        stoppedProductIds: [],
        stoppedMeatIds: ['beef'],
        stoppedSauceIds: ['tasty'],
      });
    },
  });

  await api.updateSettings({
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: ['beef'],
    stoppedSauceIds: ['tasty'],
  });

  assert.ok(
    calls.some(
      ({ url, body }) =>
        url === '/api/catalog-options/meat/beef' &&
        JSON.parse(body).available === false,
    ),
  );
  assert.ok(
    calls.some(
      ({ url, body }) =>
        url === '/api/catalog-options/sauce/tasty' &&
        JSON.parse(body).available === false,
    ),
  );
  assert.ok(
    calls.some(
      ({ url, body }) =>
        url === '/api/catalog-options/meat/chicken' &&
        JSON.parse(body).available === true,
    ),
  );
});

test('production kitchen loads server order history from the staff endpoint', async () => {
  const calls = [];
  const api = createKitchenApi({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });
      return response({ orders: [] });
    },
  });

  await api.getHistory({ query: '24', status: 'completed' });

  assert.deepEqual(calls, [
    {
      url: '/api/staff/orders/history?query=24&status=completed',
      method: 'GET',
    },
  ]);
});

test('production kitchen preserves the refund state in order history', () => {
  const order = normalizeProductionKitchenOrder({
    id: 'order-1',
    public_number: 17,
    status: 'cancelled',
    payment_status: 'paid',
    refundStatus: 'failed',
    items: [],
  });

  assert.equal(order.refundStatus, 'failed');
});

test('production kitchen cancellation sends reason and confirmed order number to refund endpoint', async () => {
  const requests = [];
  const api = createKitchenApi({
    baseUrl: '/api',
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          order: {
            id: 'order-1',
            public_number: 17,
            status: 'cancelled',
            payment_status: 'refunded',
            version: 5,
            items: [],
          },
          refundStatus: 'succeeded',
        }),
      };
    },
  });

  const result = await api.cancelOrder(
    'order-1',
    {
      reasonId: 'customer_request',
      comment: 'Клиент попросил отменить',
      confirmationNumber: '17',
    },
    4,
  );

  assert.equal(requests[0].url, '/api/staff/orders/order-1/cancel');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    version: 4,
    reasonId: 'customer_request',
    reason: 'Клиент попросил отменить',
    confirmationNumber: '17',
  });
  assert.equal(result.refundStatus, 'succeeded');
  assert.equal(result.order.refundStatus, 'succeeded');
});

test('экран кухни показывает общие настройки без публичного PIN', () => {
  const html = readText('kitchen.html');
  const portal = readText('index.html');
  assert.doesNotMatch(html, /0000|Личный PIN|Демо-PIN/);
  assert.doesNotMatch(portal, /0000|2468|PIN\s*\d{4}/);
  assert.match(html, /data-kitchen-settings-open/);
  assert.match(html, /data-accepting-orders/);
  assert.match(html, /data-stop-list/);
  assert.match(html, /Курица/);
  assert.match(html, /Говядина/);
  assert.match(html, /Соусы донера/);
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
