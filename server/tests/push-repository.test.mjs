import test from 'node:test';
import assert from 'node:assert/strict';

import { createPushRepository } from '../src/repositories/push.js';

const createPool = ({ rows = [], clientRows = [] } = {}) => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ target: 'client', sql, params });
      const next = clientRows.shift();
      return next ?? { rows: [] };
    },
    release() {
      calls.push({ target: 'client', sql: 'release', params: [] });
    },
  };
  const pool = {
    async query(sql, params = []) {
      calls.push({ target: 'pool', sql, params });
      const next = rows.shift();
      return next ?? { rows: [] };
    },
    async connect() {
      calls.push({ target: 'pool', sql: 'connect', params: [] });
      return client;
    },
  };
  return { pool, calls };
};

test('push subscription upsert is unique by endpoint and reassigns the authenticated account', async () => {
  const { pool, calls } = createPool({
    rows: [{ rows: [{ endpoint: 'https://push.test/one' }] }],
  });
  const repository = createPushRepository(pool, { createId: () => 'subscription-1' });

  const saved = await repository.upsertSubscription({
    accountId: 'courier-1',
    endpoint: 'https://push.test/one',
    p256dh: 'public-key',
    auth: 'auth-key',
    userAgent: 'Android',
  });

  assert.equal(saved.endpoint, 'https://push.test/one');
  assert.match(calls[0].sql, /on conflict \(endpoint\) do update/i);
  assert.match(calls[0].sql, /staff_account_id = excluded\.staff_account_id/i);
  assert.deepEqual(calls[0].params, [
    'subscription-1',
    'courier-1',
    'https://push.test/one',
    'public-key',
    'auth-key',
    'Android',
  ]);
});

test('push subscription removal is scoped to the authenticated account', async () => {
  const { pool, calls } = createPool({ rows: [{ rowCount: 1, rows: [] }] });
  const repository = createPushRepository(pool);

  assert.equal(
    await repository.deleteSubscription('courier-1', 'https://push.test/one'),
    true,
  );
  assert.match(calls[0].sql, /staff_account_id = \$1 and endpoint = \$2/i);
  assert.deepEqual(calls[0].params, ['courier-1', 'https://push.test/one']);
});

test('only active subscriptions owned by active courier accounts are delivered', async () => {
  const { pool, calls } = createPool({
    rows: [{
      rows: [{
        endpoint: 'https://push.test/one',
        p256dh: 'public-key',
        auth: 'auth-key',
      }],
    }],
  });
  const repository = createPushRepository(pool);

  assert.deepEqual(await repository.listActiveCourierSubscriptions(), [{
    endpoint: 'https://push.test/one',
    keys: { p256dh: 'public-key', auth: 'auth-key' },
  }]);
  assert.match(calls[0].sql, /join staff_accounts/i);
  assert.match(calls[0].sql, /role = 'courier'/i);
  assert.match(calls[0].sql, /s\.active = true/i);
  assert.match(calls[0].sql, /a\.active = true/i);
});

test('claiming a push job locks one due row and records the attempt atomically', async () => {
  const { pool, calls } = createPool({
    clientRows: [
      { rows: [] },
      { rows: [{ id: 42, payload: { orderId: 'order-1' }, attempts: 0 }] },
      { rows: [{ id: 42, payload: { orderId: 'order-1' }, attempts: 1 }] },
      { rows: [] },
    ],
  });
  const repository = createPushRepository(pool);

  const job = await repository.claimNextJob();

  assert.deepEqual(job, { id: 42, payload: { orderId: 'order-1' }, attempts: 1 });
  assert.equal(calls[1].sql, 'begin');
  assert.match(calls[2].sql, /for update skip locked/i);
  assert.match(calls[2].sql, /available_at <= now\(\)/i);
  assert.match(calls[3].sql, /status = 'sending'/i);
  assert.match(calls[3].sql, /attempts = attempts \+ 1/i);
  assert.equal(calls[4].sql, 'commit');
  assert.equal(calls.at(-1).sql, 'release');
});

test('push job state updates keep success retry and dead-letter paths separate', async () => {
  const { pool, calls } = createPool({
    rows: [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }],
  });
  const repository = createPushRepository(pool);

  await repository.markJobSent(1);
  await repository.rescheduleJob(2, 'temporary', 30_000);
  await repository.markJobDead(3, 'permanent');
  await repository.deactivateSubscription('https://push.test/stale', 'gone');
  await repository.markSubscriptionSuccess('https://push.test/ok');

  assert.match(calls[0].sql, /status = 'sent'/i);
  assert.match(calls[1].sql, /status = 'pending'/i);
  assert.match(calls[1].sql, /available_at = now\(\) \+ \(\$3 \* interval '1 millisecond'\)/i);
  assert.deepEqual(calls[1].params, [2, 'temporary', 30_000]);
  assert.match(calls[2].sql, /status = 'dead'/i);
  assert.match(calls[3].sql, /active = false/i);
  assert.match(calls[4].sql, /last_success_at = now\(\)/i);
});
