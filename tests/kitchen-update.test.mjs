import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as kitchen from '../kitchen.js';

const kitchenWorkerSource = await readFile(
  new URL('../kitchen-sw.js', import.meta.url),
  'utf8',
);

const activateWorker = async (cacheKeys) => {
  const listeners = new Map();
  const deletedCaches = [];
  const navigatedUrls = [];
  let claimed = 0;
  const clientUrl = 'https://stage.pivdoner.ru/kitchen.html';

  const context = {
    URL,
    Promise,
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    caches: {
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => [...cacheKeys],
      delete: async (key) => {
        deletedCaches.push(key);
        return true;
      },
      match: async () => null,
    },
    self: {
      registration: { scope: 'https://stage.pivdoner.ru/' },
      addEventListener: (type, callback) => listeners.set(type, callback),
      skipWaiting: () => {},
      location: { origin: 'https://stage.pivdoner.ru' },
      clients: {
        claim: async () => {
          claimed += 1;
        },
        matchAll: async () => [
          {
            url: clientUrl,
            navigate: async (url) => navigatedUrls.push(url),
          },
        ],
      },
    },
  };

  vm.runInNewContext(kitchenWorkerSource, context);
  let activation;
  listeners.get('activate')({ waitUntil: (promise) => { activation = promise; } });
  await activation;

  return { claimed, deletedCaches, navigatedUrls, clientUrl };
};

test('an updated kitchen worker reloads an already open kitchen once', async () => {
  const result = await activateWorker(['pivnoy-doner-kitchen-shell-v8']);

  assert.equal(result.claimed, 1);
  assert.deepEqual(result.deletedCaches, ['pivnoy-doner-kitchen-shell-v8']);
  assert.deepEqual(result.navigatedUrls, [result.clientUrl]);
});

test('the first kitchen worker installation does not reload the page', async () => {
  const result = await activateWorker([]);

  assert.equal(result.claimed, 1);
  assert.deepEqual(result.navigatedUrls, []);
});

test('a repeated kitchen error replaces the matching toast instead of stacking', () => {
  const removed = [];
  const container = {
    children: [
      {
        dataset: { toastKey: 'error:Не удалось выполнить действие' },
        remove: () => removed.push('matching'),
      },
      {
        dataset: { toastKey: 'normal:Статус сохранён' },
        remove: () => removed.push('other'),
      },
    ],
  };

  const removedCount = kitchen.removeMatchingToasts?.(
    container,
    'error:Не удалось выполнить действие',
  );

  assert.equal(removedCount, 1);
  assert.deepEqual(removed, ['matching']);
});

test('cancelled history shows a truthful failed refund with retry control', () => {
  const markup = kitchen.createHistoryMarkup?.([
    {
      id: 'order-1',
      number: '17',
      status: 'cancelled',
      fulfillment: 'delivery',
      total: 300,
      refundStatus: 'failed',
    },
  ]);

  assert.match(markup, /Возврат не выполнен/);
  assert.match(markup, /data-retry-refund/);
  assert.match(markup, /data-order-id="order-1"/);
});

test('refund updates refresh the open history without a manual reload', () => {
  assert.equal(
    kitchen.shouldRefreshHistoryForEvent?.(
      { type: 'sync.required', sourceType: 'refund.updated' },
      'history',
    ),
    true,
  );
  assert.equal(
    kitchen.shouldRefreshHistoryForEvent?.(
      { type: 'sync.required', sourceType: 'order.updated' },
      'history',
    ),
    false,
  );
});
