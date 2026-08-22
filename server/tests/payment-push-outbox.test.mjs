import assert from 'node:assert/strict';
import test from 'node:test';

import { createPaymentsRepository } from '../src/repositories/payments.js';

const makePool = (responses) => {
  const calls = [];
  const queue = [...responses];
  const client = {
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return queue.shift() ?? { rows: [] };
    },
    release: () => {},
  };
  return {
    calls,
    pool: { connect: async () => client },
  };
};

const currentPayment = (overrides = {}) => ({
  order_id: 'order-1',
  status: 'pending',
  order_payment_status: 'pending',
  fulfillment: 'delivery',
  public_number: 1464,
  address: {
    street: 'Волоколамское шоссе 71/22 к.2',
    entrance: '2',
    floor: '3',
    apartment: '15',
    intercom: '10',
  },
  eta_min: 12,
  eta_max: 18,
  ...overrides,
});

const updatedOrder = {
  id: 'order-1',
  payment_status: 'paid',
  status: 'submitted',
  version: 2,
  updated_at: '2026-08-22T10:00:00.000Z',
};

test('paid delivery atomically enqueues one privacy-safe courier push job', async () => {
  const { pool, calls } = makePool([
    { rows: [] },
    { rows: [currentPayment()] },
    { rows: [] },
    { rows: [updatedOrder] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ]);

  const result = await createPaymentsRepository(pool).applyVerifiedState({
    providerPaymentId: 'provider-pay-1',
    status: 'paid',
    providerPayload: { id: 'provider-pay-1' },
  });

  assert.equal(result.applied, true);
  const enqueue = calls.find(({ sql }) => /insert into push_jobs/i.test(sql));
  assert.ok(enqueue, 'delivery payment must enqueue a courier push job');
  assert.match(enqueue.sql, /on conflict\s*\(event_key\)\s*do nothing/i);
  assert.equal(enqueue.params[0], 'courier.order_paid:order-1');
  assert.equal(enqueue.params[1], 'order-1');
  assert.deepEqual(enqueue.params[2], {
    orderId: 'order-1',
    number: '1464',
    eta: { min: 12, max: 18 },
    address:
      'Волоколамское шоссе 71/22 к.2 · подъезд 2 · этаж 3 · кв. 15 · домофон 10',
    url: '/courier.html',
  });
  assert.doesNotMatch(JSON.stringify(enqueue.params[2]), /phone|телефон/i);
  assert.ok(
    calls.findIndex(({ sql }) => /insert into push_jobs/i.test(sql)) <
      calls.findIndex(({ sql }) => /^commit$/i.test(sql.trim())),
    'push job must be persisted before the payment transaction commits',
  );
});

test('paid pickup does not enqueue a courier push job', async () => {
  const { pool, calls } = makePool([
    { rows: [] },
    { rows: [currentPayment({ fulfillment: 'pickup', address: {} })] },
    { rows: [] },
    { rows: [updatedOrder] },
    { rows: [] },
    { rows: [] },
  ]);

  await createPaymentsRepository(pool).applyVerifiedState({
    providerPaymentId: 'provider-pay-2',
    status: 'paid',
    providerPayload: { id: 'provider-pay-2' },
  });

  assert.equal(calls.some(({ sql }) => /insert into push_jobs/i.test(sql)), false);
});

test('replayed paid webhook does not enqueue another courier push job', async () => {
  const { pool, calls } = makePool([
    { rows: [] },
    {
      rows: [
        currentPayment({ status: 'paid', order_payment_status: 'paid' }),
      ],
    },
    { rows: [] },
  ]);

  const result = await createPaymentsRepository(pool).applyVerifiedState({
    providerPaymentId: 'provider-pay-1',
    status: 'paid',
    providerPayload: { id: 'provider-pay-1' },
  });

  assert.equal(result.applied, false);
  assert.equal(calls.some(({ sql }) => /insert into push_jobs/i.test(sql)), false);
});
