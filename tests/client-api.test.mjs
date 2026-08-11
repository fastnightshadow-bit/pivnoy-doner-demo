import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createClientApi,
  normalizeClientOrderResponse,
} from '../client-api.js';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('создание заказа передаёт ключ идемпотентности', async () => {
  const calls = [];
  const api = createClientApi({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'order-1', status: 'submitted' }, 201);
    },
  });

  const order = await api.createOrder({ items: [] }, 'checkout-123');

  assert.equal(order.id, 'order-1');
  assert.equal(calls[0].url, '/api/orders');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'checkout-123');
  assert.equal(calls[0].options.credentials, 'same-origin');
});

test('ошибка API сохраняет код и HTTP-статус', async () => {
  const api = createClientApi({
    fetcher: async () => jsonResponse({ error: 'MINIMUM_ORDER' }, 422),
  });

  await assert.rejects(
    api.createOrder({ items: [] }, 'checkout-123'),
    (error) =>
      error.code === 'MINIMUM_ORDER' && error.status === 422,
  );
});

test('получение заказа кодирует идентификатор', async () => {
  const calls = [];
  const api = createClientApi({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'order/1' });
    },
  });

  await api.getOrder('order/1');

  assert.equal(calls[0].url, '/api/orders/order%2F1');
  assert.equal(calls[0].options.credentials, 'same-origin');
});

test('отзыв отправляется только для указанного заказа', async () => {
  const calls = [];
  const api = createClientApi({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'review-1', rating: 5 }, 201);
    },
  });

  await api.submitReview('order/1', {
    rating: 5,
    authorName: 'Илья',
    comment: 'Всё отлично',
  });

  assert.equal(calls[0].url, '/api/orders/order%2F1/review');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    rating: 5,
    authorName: 'Илья',
    comment: 'Всё отлично',
  });
});

test('client order request sends the private access token in a header', async () => {
  const calls = [];
  const api = createClientApi({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'order/1' });
    },
  });

  await api.getOrder('order/1', 'secret-token');

  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token');
  assert.doesNotMatch(calls[0].url, /secret-token/);
});

test('payment retry sends access token only in Authorization', async () => {
  const calls = [];
  const api = createClientApi({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ id: 'payment-1' }, 201);
    },
  });

  await api.createPayment('order/1', 'retry-1', 'secret-token');

  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token');
  assert.doesNotMatch(calls[0].url, /secret-token/);
  assert.doesNotMatch(calls[0].options.body, /secret-token/);
});

test('order subscription polls after completion without overlapping requests', async () => {
  const calls = [];
  const timers = [];
  let resolveFirst;
  const firstResponse = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const api = createClientApi({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return firstResponse;
      return jsonResponse({ id: 'order/1', status: 'accepted' });
    },
    documentRef: {
      visibilityState: 'visible',
      addEventListener() {},
      removeEventListener() {},
    },
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutFn() {},
  });
  const updates = [];

  const unsubscribe = api.subscribeToOrder('order/1', 'secret-token', {
    onUpdate: (payload) => updates.push(payload),
  });
  assert.equal(calls.length, 1);
  assert.equal(timers.length, 0);
  resolveFirst(jsonResponse({ id: 'order/1', status: 'submitted' }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 3000);
  await timers[0].callback();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer secret-token');
  assert.doesNotMatch(calls[1].url, /secret-token/);
  assert.deepEqual(
    updates.map(({ status }) => status),
    ['submitted', 'accepted'],
  );
  unsubscribe();
});

test('order polling pauses while hidden, refreshes on visibility and cleans up', async () => {
  const listeners = new Map();
  const timers = [];
  const cleared = [];
  const documentRef = {
    visibilityState: 'hidden',
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  let fetches = 0;
  const api = createClientApi({
    fetcher: async () => {
      fetches += 1;
      return jsonResponse({ id: 'order-1', status: 'accepted' });
    },
    documentRef,
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutFn: (id) => cleared.push(id),
  });

  const unsubscribe = api.subscribeToOrder('order-1', 'secret-token', {});
  assert.equal(fetches, 0);
  documentRef.visibilityState = 'visible';
  listeners.get('visibilitychange')();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetches, 1);
  assert.equal(timers.length, 1);

  unsubscribe();
  assert.equal(listeners.has('visibilitychange'), false);
  assert.deepEqual(cleared, [1]);
  await timers[0].callback();
  assert.equal(fetches, 1);
});

test('polling reports errors and preserves the last successful update', async () => {
  const timers = [];
  const updates = [];
  const errors = [];
  let attempt = 0;
  const api = createClientApi({
    fetcher: async () => {
      attempt += 1;
      if (attempt === 2) throw new Error('offline');
      return jsonResponse({ id: 'order-1', status: 'accepted' });
    },
    documentRef: {
      visibilityState: 'visible',
      addEventListener() {},
      removeEventListener() {},
    },
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutFn() {},
  });

  const unsubscribe = api.subscribeToOrder('order-1', 'secret-token', {
    onUpdate: (payload) => updates.push(payload),
    onError: (error) => errors.push(error),
  });
  await new Promise((resolve) => setImmediate(resolve));
  await timers[0].callback();

  assert.equal(updates.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'offline');
  assert.equal(timers.length, 2);
  unsubscribe();
});

test('серверный заказ приводится к формату экрана клиента', () => {
  const order = normalizeClientOrderResponse({
    id: 'order-1',
    number: '1464',
    createdAt: '2026-08-11T10:00:00.000Z',
    fulfillment: 'delivery',
    deliveryTotal: 200,
    discountTotal: 50,
    itemsTotal: 1000,
    total: 1150,
    items: [{
      productId: 'nuggets',
      name: 'Наггетсы',
      quantity: 1,
      unitPrice: 300,
      configuration: { sauces: { tasty: 2 } },
    }],
  });

  assert.equal(order.delivery, 200);
  assert.equal(order.discount, 50);
  assert.deepEqual(order.items[0].sauces, { tasty: 2 });
});

test('payment retry uses a separate idempotency key', async () => {
  const calls = [];
  const api = createClientApi({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        id: 'pay-2',
        confirmationUrl: 'https://yookassa.test/pay-2',
      }, 201);
    },
  });

  const payment = await api.createPayment(
    'order/1',
    'retry-payment-1',
    'secret-token',
  );

  assert.equal(payment.id, 'pay-2');
  assert.equal(calls[0].url, '/api/payments');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'retry-payment-1');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { orderId: 'order/1' });
});
