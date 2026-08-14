import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import {
  deriveOrderAccessToken,
  hashOrderAccessToken,
} from '../src/domain/order-access.js';
import { createStaffOrdersRepository } from '../src/repositories/staff-orders.js';

const retryKey = 'checkout-private-retry-key';
const recoveredAccessToken = deriveOrderAccessToken({
  orderId: 'order-1',
  idempotencyKey: retryKey,
  secret: 'staff-security-test-secret',
});

const rawStaffOrder = Object.freeze({
  id: 'order-1',
  public_number: 1464,
  idempotency_key: retryKey,
  status: 'cooking',
  fulfillment: 'delivery',
  payment_status: 'paid',
  customer_name: 'Ilya',
  phone: '+79991234567',
  address: { street: 'Test street', house: '1' },
  customer_comment: 'No onions',
  courier_comment: 'Call on arrival',
  items_total: 700,
  delivery_total: 200,
  discount_total: 0,
  total: 900,
  eta_min: 8,
  eta_max: 12,
  version: 3,
  created_at: '2026-08-12T12:00:00.000Z',
  updated_at: '2026-08-12T12:05:00.000Z',
  personal_data_consent_at: '2026-08-12T12:00:00.000Z',
  personal_data_consent_version: '2026-08-11',
  offer_version: '2026-08-11',
  access_token_hash: hashOrderAccessToken(recoveredAccessToken),
  unexpected_internal_proof: 'must-not-leak',
  items: [
    {
      id: 'line-1',
      order_id: 'order-1',
      product_id: 'nuggets',
      name: 'Наггетсы',
      quantity: 1,
      unit_price: 300,
      configuration: {
        meat: 'default',
        size: 'single',
        addons: {},
        sauces: { tasty: 2 },
        accessTokenHash: 'nested-proof',
      },
      access_token_hash: 'nested-row-proof',
    },
  ],
  history: [
    {
      from: 'accepted',
      to: 'cooking',
      employee: 'Кухня',
      at: '2026-08-12T12:05:00.000Z',
      reason: '',
      actor_id: 'private-staff-id',
    },
  ],
});

const createStaffApp = () =>
  createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    authService: {
      authenticate: async (token) =>
        ['owner', 'kitchen', 'courier'].includes(token)
          ? { id: `${token}-1`, displayName: token, role: token }
          : null,
      login: async () => null,
      logout: async () => {},
    },
    staffOrders: { listActive: async () => [rawStaffOrder] },
    statusService: { change: async () => null },
  });

test('staff roles cannot recover a customer bearer token from an order response', async () => {
  for (const role of ['owner', 'kitchen']) {
    const response = await request(createStaffApp())
      .get('/api/staff/orders')
      .set('Cookie', `pivdoner_session=${role}`);

    assert.equal(response.status, 200, role);
    assert.equal(response.body.orders.length, 1, role);
    const [order] = response.body.orders;
    assert.deepEqual(
      Object.keys(order).sort(),
      [
        'address',
        'comment',
        'courierComment',
        'createdAt',
        'customerName',
        'deliveryTotal',
        'discountTotal',
        'eta',
        'fulfillment',
        'history',
        'id',
        'items',
        'itemsTotal',
        'number',
        'paymentStatus',
        'phone',
        'status',
        'total',
        'updatedAt',
        'version',
      ].sort(),
      role,
    );
    assert.deepEqual(order.items, [
      {
        id: 'line-1',
        productId: 'nuggets',
        name: 'Наггетсы',
        quantity: 1,
        unitPrice: 300,
        configuration: {
          meat: 'default',
          size: 'single',
          addons: {},
          sauces: { tasty: 2 },
        },
      },
    ]);
    assert.deepEqual(order.history, [
      {
        from: 'accepted',
        to: 'cooking',
        employee: 'Кухня',
        at: '2026-08-12T12:05:00.000Z',
        reason: '',
      },
    ]);

    const serialized = JSON.stringify(response.body);
    for (const credential of [
      retryKey,
      rawStaffOrder.access_token_hash,
      recoveredAccessToken,
      'must-not-leak',
      'nested-proof',
      'private-staff-id',
    ]) {
      assert.equal(serialized.includes(credential), false, `${role}: ${credential}`);
    }
  }
});

test('courier receives only delivery contact, address, ETA and status data', async () => {
  const response = await request(createStaffApp())
    .get('/api/staff/orders')
    .set('Cookie', 'pivdoner_session=courier');

  assert.equal(response.status, 200);
  assert.equal(response.body.orders.length, 1);
  assert.deepEqual(
    Object.keys(response.body.orders[0]).sort(),
    [
      'address',
      'createdAt',
      'eta',
      'fulfillment',
      'id',
      'number',
      'paymentStatus',
      'phone',
      'status',
      'version',
    ].sort(),
  );
});

test('staff order SQL selects only role-safe order and item fields', async () => {
  let sql = '';
  const repository = createStaffOrdersRepository({
    query: async (statement) => {
      sql = String(statement);
      return { rows: [] };
    },
  });

  await repository.listActive();

  assert.doesNotMatch(sql, /\bo\.\*/i);
  assert.doesNotMatch(
    sql,
    /idempotency_key|access_token_hash|personal_data_consent|offer_version/i,
  );
});
