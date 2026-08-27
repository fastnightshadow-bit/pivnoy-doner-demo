import test from 'node:test';
import assert from 'node:assert/strict';

import { createPaymentsRepository } from '../src/repositories/payments.js';
import {
  createRefundRetryWorker,
  startRefundRetryLoop,
} from '../src/refunds/retry-worker.js';

test('refund worker retries every due refund and isolates one failed task', async () => {
  const calls = [];
  const logged = [];
  const worker = createRefundRetryWorker({
    payments: {
      listRefundsForRetry: async () => [
        {
          orderId: 'order-1',
          reason: 'Отмена заказа',
          requestedBy: 'account-1',
        },
        {
          orderId: 'order-2',
          reason: 'Ошибка кухни',
          requestedBy: null,
        },
      ],
    },
    paymentService: {
      refundFull: async (input) => {
        calls.push(input);
        if (input.orderId === 'order-2') throw new Error('provider offline');
        return { status: 'succeeded' };
      },
    },
    logger: { error: (...args) => logged.push(args) },
  });

  const result = await worker.tick();

  assert.deepEqual(calls, [
    {
      orderId: 'order-1',
      reason: 'Отмена заказа',
      account: { id: 'account-1' },
    },
    {
      orderId: 'order-2',
      reason: 'Ошибка кухни',
      account: null,
    },
  ]);
  assert.deepEqual(result, { processed: 2, succeeded: 1 });
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged.flat().join(' '), /provider offline/);
});

test('refund worker never overlaps its own retry cycles', async () => {
  let releaseRefund;
  const waiting = new Promise((resolve) => {
    releaseRefund = resolve;
  });
  const worker = createRefundRetryWorker({
    payments: {
      listRefundsForRetry: async () => [
        { orderId: 'order-1', reason: 'Отмена', requestedBy: null },
      ],
    },
    paymentService: {
      refundFull: async () => waiting,
    },
    logger: { error: () => {} },
  });

  const first = worker.tick();
  await Promise.resolve();
  assert.deepEqual(await worker.tick(), {
    processed: 0,
    succeeded: 0,
    skipped: true,
  });
  releaseRefund({ status: 'succeeded' });
  assert.deepEqual(await first, { processed: 1, succeeded: 1 });
});

test('refund repository selects pending and provider-blocked attempts with backoff', async () => {
  const calls = [];
  const repository = createPaymentsRepository({
    query: async (sql, values) => {
      calls.push({ sql, values });
      return {
        rows: [{
          order_id: 'order-1',
          payment_id: 'payment-1',
          idempotency_key: 'refund-key-1',
          status: 'failed',
          amount: 300,
          currency: 'RUB',
          reason: 'Отмена',
          requested_by: 'account-1',
          last_error: 'REFUND_PROVIDER_FORBIDDEN',
        }],
      };
    },
  });

  const refunds = await repository.listRefundsForRetry({ limit: 7 });

  assert.equal(refunds[0].orderId, 'order-1');
  assert.equal(refunds[0].requestedBy, 'account-1');
  assert.match(calls[0].sql, /status = 'pending'/i);
  assert.match(calls[0].sql, /status = 'failed'/i);
  assert.match(calls[0].sql, /REFUND_PROVIDER_FORBIDDEN/);
  assert.match(calls[0].sql, /interval '5 minutes'/i);
  assert.match(calls[0].sql, /interval '6 hours'/i);
  assert.deepEqual(calls[0].values, [7]);
});

test('refund retry loop starts immediately and can be stopped cleanly', async () => {
  let ticks = 0;
  let scheduled = null;
  let cleared = null;
  let unrefCalled = false;
  const timer = {
    unref: () => {
      unrefCalled = true;
    },
  };

  const stop = startRefundRetryLoop({
    worker: {
      tick: async () => {
        ticks += 1;
      },
    },
    pollMs: 60_000,
    setIntervalFn: (callback, delay) => {
      scheduled = { callback, delay };
      return timer;
    },
    clearIntervalFn: (value) => {
      cleared = value;
    },
    logger: { error: () => assert.fail('successful tick must not log') },
  });

  await Promise.resolve();
  assert.equal(ticks, 1);
  assert.equal(scheduled.delay, 60_000);
  assert.equal(unrefCalled, true);
  await scheduled.callback();
  assert.equal(ticks, 2);
  stop();
  assert.equal(cleared, timer);
});
