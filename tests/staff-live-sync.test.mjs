import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStaffLiveSync,
  executeVersionedAction,
} from '../staff-live-sync.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('fallback synchronization refreshes every five seconds without overlapping requests', async () => {
  const pending = deferred();
  const refreshCalls = [];
  const timers = [];
  const sync = createStaffLiveSync({
    refresh: () => {
      refreshCalls.push(Date.now());
      return pending.promise;
    },
    subscribe: () => () => {},
    setIntervalFn: (callback, milliseconds) => {
      timers.push({ callback, milliseconds });
      return 7;
    },
    clearIntervalFn: () => {},
  });

  sync.start(() => {});
  assert.equal(timers[0].milliseconds, 5000);
  timers[0].callback();
  timers[0].callback();
  await Promise.resolve();
  assert.equal(refreshCalls.length, 1);

  pending.resolve();
  await sync.sync();
});

test('an update received during an active refresh queues one trailing refresh', async () => {
  const firstRefresh = deferred();
  const secondRefresh = deferred();
  let refreshCalls = 0;
  const sync = createStaffLiveSync({
    refresh: () => {
      refreshCalls += 1;
      return refreshCalls === 1 ? firstRefresh.promise : secondRefresh.promise;
    },
  });

  const initialSync = sync.sync();
  await Promise.resolve();
  assert.equal(refreshCalls, 1);

  const eventSync = sync.sync();
  const duplicateEventSync = sync.sync();
  firstRefresh.resolve();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(refreshCalls, 2);
  secondRefresh.resolve();
  await Promise.all([initialSync, eventSync, duplicateEventSync]);
  assert.equal(refreshCalls, 2);
});

test('stopping live synchronization closes events and clears fallback timer', () => {
  const calls = [];
  const sync = createStaffLiveSync({
    refresh: async () => {},
    subscribe: () => () => calls.push('events'),
    setIntervalFn: () => 11,
    clearIntervalFn: (timer) => calls.push(`timer:${timer}`),
  });

  sync.start(() => {});
  sync.stop();

  assert.deepEqual(calls, ['events', 'timer:11']);
});

test('a stale version is refreshed and the still-valid action is retried once', async () => {
  const versions = [];
  const result = await executeVersionedAction({
    entityId: 'order-1',
    initialVersion: 2,
    execute: async (version) => {
      versions.push(version);
      if (version === 2) throw Object.assign(new Error('stale'), { status: 409 });
      return { order: { id: 'order-1', version: 4, status: 'cooking' } };
    },
    refresh: async () => [{ id: 'order-1', version: 3, status: 'accepted' }],
    canRetry: (order) => order.status === 'accepted',
  });

  assert.deepEqual(versions, [2, 3]);
  assert.equal(result.order.status, 'cooking');
});

test('a stale action is not repeated when refreshed order has already moved on', async () => {
  let executions = 0;
  const result = await executeVersionedAction({
    entityId: 'order-1',
    initialVersion: 2,
    execute: async () => {
      executions += 1;
      throw Object.assign(new Error('stale'), { status: 409 });
    },
    refresh: async () => [{ id: 'order-1', version: 3, status: 'cooking' }],
    canRetry: (order) => order.status === 'accepted',
  });

  assert.equal(executions, 1);
  assert.deepEqual(result, {
    refreshed: true,
    alreadyChanged: true,
    entity: { id: 'order-1', version: 3, status: 'cooking' },
  });
});
