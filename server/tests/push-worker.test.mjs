import assert from 'node:assert/strict';
import test from 'node:test';

import { createPushWorker } from '../src/push/worker.js';

const subscription = (suffix) => ({
  endpoint: `https://push.example/${suffix}`,
  keys: { p256dh: `p256-${suffix}`, auth: `auth-${suffix}` },
});

const createHarness = ({ job = null, subscriptions = [], send } = {}) => {
  const calls = [];
  const repository = {
    claimNextJob: async () => job,
    listActiveCourierSubscriptions: async () => subscriptions,
    markSubscriptionSuccess: async (endpoint) =>
      calls.push(['subscription-success', endpoint]),
    deactivateSubscription: async (endpoint, error) =>
      calls.push(['subscription-deactivated', endpoint, error]),
    markJobSent: async (id) => calls.push(['sent', id]),
    rescheduleJob: async (id, error, delayMs) =>
      calls.push(['retry', id, error, delayMs]),
    markJobDead: async (id, error) => calls.push(['dead', id, error]),
  };
  const sender = {
    send: send ?? (async (target, payload) => calls.push(['send', target, payload])),
  };
  const worker = createPushWorker({
    repository,
    sender,
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 5_000,
  });
  return { worker, calls };
};

test('push worker is a no-op when no job is queued', async () => {
  const { worker, calls } = createHarness();

  const processed = await worker.tick();

  assert.equal(processed, false);
  assert.deepEqual(calls, []);
});

test('push worker delivers to all active courier subscriptions and marks sent', async () => {
  const job = { id: 7, attempts: 1, payload: { orderId: 'order-1' } };
  const targets = [subscription('a'), subscription('b')];
  const sent = [];
  const { worker, calls } = createHarness({
    job,
    subscriptions: targets,
    send: async (target, payload) => sent.push([target, payload]),
  });

  assert.equal(await worker.tick(), true);
  assert.deepEqual(sent, targets.map((target) => [target, job.payload]));
  assert.deepEqual(
    calls.filter(([type]) => type === 'subscription-success'),
    targets.map((target) => ['subscription-success', target.endpoint]),
  );
  assert.deepEqual(calls.at(-1), ['sent', 7]);
});

test('HTTP 404 and 410 deactivate only stale subscriptions', async () => {
  const stale404 = subscription('404');
  const stale410 = subscription('410');
  const active = subscription('active');
  const { worker, calls } = createHarness({
    job: { id: 8, attempts: 1, payload: { orderId: 'order-2' } },
    subscriptions: [stale404, stale410, active],
    send: async (target) => {
      if (target === stale404) throw Object.assign(new Error('gone 404'), { statusCode: 404 });
      if (target === stale410) throw Object.assign(new Error('gone 410'), { statusCode: 410 });
    },
  });

  await worker.tick();

  assert.deepEqual(
    calls.filter(([type]) => type === 'subscription-deactivated').map((call) => call[1]),
    [stale404.endpoint, stale410.endpoint],
  );
  assert.ok(calls.some((call) => call[0] === 'subscription-success' && call[1] === active.endpoint));
  assert.deepEqual(calls.at(-1), ['sent', 8]);
});

test('temporary failure retries with bounded exponential backoff', async () => {
  const { worker, calls } = createHarness({
    job: { id: 9, attempts: 2, payload: { orderId: 'order-3' } },
    subscriptions: [subscription('temporary')],
    send: async () => {
      throw Object.assign(new Error('temporary outage'), { statusCode: 503 });
    },
  });

  await worker.tick();

  assert.deepEqual(calls, [['retry', 9, 'temporary outage', 2_000]]);
});

test('maximum attempts mark an undeliverable job dead', async () => {
  const { worker, calls } = createHarness({
    job: { id: 10, attempts: 3, payload: { orderId: 'order-4' } },
    subscriptions: [subscription('dead')],
    send: async () => {
      throw new Error('still offline');
    },
  });

  await worker.tick();

  assert.deepEqual(calls, [['dead', 10, 'still offline']]);
});

test('no active subscription consumes the job instead of replaying old orders', async () => {
  const { worker, calls } = createHarness({
    job: { id: 11, attempts: 1, payload: { orderId: 'order-5' } },
    subscriptions: [],
  });

  await worker.tick();

  assert.deepEqual(calls, [['sent', 11]]);
});

test('one transiently failed subscription does not block another successful delivery', async () => {
  const failed = subscription('failed');
  const successful = subscription('successful');
  const { worker, calls } = createHarness({
    job: { id: 12, attempts: 1, payload: { orderId: 'order-6' } },
    subscriptions: [failed, successful],
    send: async (target) => {
      if (target === failed) throw new Error('temporary failure');
    },
  });

  await worker.tick();

  assert.ok(calls.some((call) => call[0] === 'subscription-success' && call[1] === successful.endpoint));
  assert.equal(calls.some((call) => call[0] === 'retry'), false);
  assert.deepEqual(calls.at(-1), ['sent', 12]);
});

test('overlapping ticks share one in-flight claim', async () => {
  let releaseClaim;
  let claims = 0;
  const repository = {
    claimNextJob: async () => {
      claims += 1;
      await new Promise((resolve) => {
        releaseClaim = resolve;
      });
      return null;
    },
  };
  const worker = createPushWorker({ repository, sender: { send: async () => {} } });

  const first = worker.tick();
  const second = worker.tick();
  releaseClaim();
  await Promise.all([first, second]);

  assert.equal(claims, 1);
});
