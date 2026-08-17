import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createStaffOrdersRepository } from '../src/repositories/staff-orders.js';

const historyOrder = {
  id: 'history-1',
  public_number: 24,
  status: 'completed',
  fulfillment: 'pickup',
  payment_status: 'paid',
  customer_name: 'Илья',
  phone: '+79990000000',
  address: {},
  customer_comment: '',
  courier_comment: '',
  items_total: 300,
  delivery_total: 0,
  discount_total: 0,
  total: 300,
  eta_min: 6,
  eta_max: 8,
  version: 5,
  created_at: '2026-08-17T10:00:00.000Z',
  updated_at: '2026-08-17T10:15:00.000Z',
  refund_status: 'failed',
  items: [],
  history: [],
};

const createHistoryApp = (role = 'kitchen') =>
  createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    authService: {
      authenticate: async () => ({ id: `${role}-1`, displayName: role, role }),
      login: async () => null,
      logout: async () => {},
    },
    staffOrders: {
      listActive: async () => [],
      listHistory: async () => [historyOrder],
    },
    statusService: { change: async () => null },
  });

test('kitchen and owner can open completed order history', async () => {
  for (const role of ['kitchen', 'owner']) {
    const response = await request(createHistoryApp(role))
      .get('/api/staff/orders/history?query=24&status=completed')
      .set('Cookie', 'pivdoner_session=session');

    assert.equal(response.status, 200, role);
    assert.equal(response.body.orders[0].number, '24', role);
    assert.equal(response.body.orders[0].status, 'completed', role);
    assert.equal(response.body.orders[0].refundStatus, 'failed', role);
  }
});

test('courier cannot open the full restaurant order history', async () => {
  const response = await request(createHistoryApp('courier'))
    .get('/api/staff/orders/history')
    .set('Cookie', 'pivdoner_session=session');

  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'FORBIDDEN');
});

test('history query is terminal-only, newest-first and capped at 100 rows', async () => {
  const calls = [];
  const repository = createStaffOrdersRepository({
    query: async (sql, values) => {
      calls.push({ sql: String(sql), values });
      return { rows: [] };
    },
  });

  await repository.listHistory({ query: '24', status: 'completed', limit: 999 });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /o\.status in \('completed', 'cancelled'\)/i);
  assert.match(calls[0].sql, /left join refund_operations r on r\.order_id = o\.id/i);
  assert.match(calls[0].sql, /o\.payment_status in \('paid', 'refunded'\)/i);
  assert.match(calls[0].sql, /order by o\.closed_at desc/i);
  assert.match(calls[0].sql, /limit \$3/i);
  assert.deepEqual(calls[0].values, ['24', 'completed', 100]);
});
