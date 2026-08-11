import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/auth/session.js';
import {
  formatSseEvent,
  getLastEventId,
  replayEvents,
} from '../src/realtime/order-events.js';
import { canSubscribeToStaffEvents } from '../src/routes/events.js';

const db = { query: async () => ({ rows: [{ ok: 1 }] }) };

const withHttpResponse = async (app, path, options, inspect) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${address.port}${path}`, options);
    await inspect(response);
  } finally {
    await response?.body?.cancel().catch(() => {});
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
};

test('SSE восстанавливает только события после Last-Event-ID', async () => {
  const events = {
    listAfter: async (lastId) =>
      [
        { id: 4, eventType: 'order.updated', payload: { id: 'order-4' } },
        { id: 5, eventType: 'order.updated', payload: { id: 'order-5' } },
      ].filter(({ id }) => id > lastId),
  };

  const replayed = await replayEvents(events, 4);

  assert.deepEqual(replayed.map(({ id }) => id), [5]);
  assert.match(formatSseEvent(replayed[0]), /^id: 5\nevent: order\.updated\ndata:/);
});

test('Last-Event-ID имеет приоритет над query-параметром', () => {
  const request = {
    get: (name) => (name === 'Last-Event-ID' ? '17' : ''),
    query: { after: '9' },
  };

  assert.equal(getLastEventId(request), 17);
});

test('общая лента событий доступна только сотрудникам', () => {
  assert.equal(canSubscribeToStaffEvents(null), false);
  assert.equal(canSubscribeToStaffEvents({ role: 'courier' }), true);
  assert.equal(canSubscribeToStaffEvents({ role: 'kitchen' }), true);
  assert.equal(canSubscribeToStaffEvents({ role: 'owner' }), true);
  assert.equal(canSubscribeToStaffEvents({ role: 'customer' }), false);
});

test('public order event access with a UUID alone returns not found', async () => {
  let eventReads = 0;
  const app = createApp({
    db,
    events: {
      listAfter: async () => {
        eventReads += 1;
        return [];
      },
    },
    authService: { authenticate: async () => null },
  });

  await withHttpResponse(
    app,
    '/api/events?orderId=0d7d410c-a81f-4d32-b719-547b72598a6d',
    {},
    async (response) => {
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'NOT_FOUND' });
    },
  );
  assert.equal(eventReads, 0);
});

test('staff event access still requires an authenticated staff session', async () => {
  const app = createApp({
    db,
    events: { listAfter: async () => [] },
    authService: { authenticate: async () => null },
  });

  const response = await request(app).get('/api/events?scope=staff');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'UNAUTHORIZED' });
});

test('authenticated staff event access still opens the staff SSE stream', async () => {
  const app = createApp({
    db,
    events: {
      listAfter: async () => [
        {
          id: 9,
          eventType: 'order.updated',
          payload: { orderId: 'order-1', status: 'accepted' },
        },
      ],
    },
    authService: {
      authenticate: async (token) =>
        token === 'staff-session' ? { id: 'staff-1', role: 'kitchen' } : null,
    },
  });

  await withHttpResponse(
    app,
    '/api/events?scope=staff',
    { headers: { Cookie: `${SESSION_COOKIE}=staff-session` } },
    async (response) => {
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/event-stream/);
      const { value } = await response.body.getReader().read();
      const chunk = new TextDecoder().decode(value);
      assert.match(chunk, /event: order\.updated/);
      assert.match(chunk, /"status":"accepted"/);
    },
  );
});
