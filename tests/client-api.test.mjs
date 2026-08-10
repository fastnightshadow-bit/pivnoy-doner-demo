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

test('подписка на заказ открывает SSE и передаёт обновление', () => {
  const opened = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      opened.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  const api = createClientApi({
    fetcher: async () => jsonResponse({}),
    EventSourceClass: FakeEventSource,
  });
  const updates = [];

  const unsubscribe = api.subscribeToOrder('order/1', {
    onUpdate: (payload) => updates.push(payload),
  });
  opened[0].onmessage({ data: JSON.stringify({ status: 'accepted' }) });
  unsubscribe();

  assert.equal(opened[0].url, '/api/events?orderId=order%2F1');
  assert.deepEqual(updates, [{ status: 'accepted' }]);
  assert.equal(opened[0].closed, true);
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
