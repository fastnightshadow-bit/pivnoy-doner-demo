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

test('a kitchen setting reacts immediately and performs only the clicked request', async () => {
  let currentSettings = {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  };
  let resolveRequest;
  let actionCalls = 0;
  let renderCalls = 0;
  const pendingChanges = [];
  const notices = [];
  const runner = kitchen.createKitchenSettingsActionRunner?.({
    isConnected: () => true,
    readSettings: () => currentSettings,
    writeSettings: (settings) => { currentSettings = settings; },
    setControlPending: (key, pending, checked) => {
      pendingChanges.push({ key, pending, checked });
    },
    renderSettings: () => { renderCalls += 1; },
    notify: (...args) => notices.push(args),
  });

  assert.ok(runner, 'settings action runner must be exported');
  const request = runner.run({
    key: 'product:classic-shawarma',
    checked: false,
    optimisticUpdate: (settings) => ({
      ...settings,
      stoppedProductIds: ['classic-shawarma'],
    }),
    action: () => {
      actionCalls += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
    successMessage: 'Блюдо добавлено в стоп-лист',
  });

  assert.equal(actionCalls, 1);
  assert.deepEqual(currentSettings.stoppedProductIds, ['classic-shawarma']);
  assert.deepEqual(pendingChanges[0], {
    key: 'product:classic-shawarma',
    pending: true,
    checked: false,
  });
  assert.equal(runner.isPending('product:classic-shawarma'), true);
  assert.equal(runner.isPending('product:doner'), false);
  assert.equal(renderCalls, 0, 'the whole catalog must not rerender before the request');

  resolveRequest({ ...currentSettings });
  await request;

  assert.equal(actionCalls, 1);
  assert.equal(renderCalls, 1);
  assert.equal(runner.isPending('product:classic-shawarma'), false);
  assert.deepEqual(pendingChanges.at(-1), {
    key: 'product:classic-shawarma',
    pending: false,
    checked: false,
  });
  assert.equal(notices[0][0], 'Блюдо добавлено в стоп-лист');
});

test('one pending kitchen setting does not block another control', async () => {
  let currentSettings = {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  };
  const resolvers = [];
  const runner = kitchen.createKitchenSettingsActionRunner?.({
    isConnected: () => true,
    readSettings: () => currentSettings,
    writeSettings: (settings) => { currentSettings = settings; },
    setControlPending() {},
    renderSettings() {},
    notify() {},
  });

  assert.ok(runner, 'settings action runner must be exported');
  const first = runner.run({
    key: 'meat:beef',
    checked: false,
    optimisticUpdate: (settings) => ({ ...settings, stoppedMeatIds: ['beef'] }),
    action: () => new Promise((resolve) => resolvers.push(resolve)),
    successMessage: 'Говядина отключена',
  });
  const second = runner.run({
    key: 'product:doner',
    checked: false,
    optimisticUpdate: (settings) => ({ ...settings, stoppedProductIds: ['doner'] }),
    action: () => new Promise((resolve) => resolvers.push(resolve)),
    successMessage: 'Донер отключён',
  });

  assert.equal(resolvers.length, 2);
  assert.equal(runner.isPending('meat:beef'), true);
  assert.equal(runner.isPending('product:doner'), true);
  resolvers[1]({ productId: 'doner', available: false });
  resolvers[0]({ kind: 'meat', optionId: 'beef', available: false });
  await Promise.all([first, second]);
  assert.deepEqual(currentSettings.stoppedMeatIds, ['beef']);
  assert.deepEqual(currentSettings.stoppedProductIds, ['doner']);
});

test('a compact server acknowledgement keeps the optimistic menu snapshot', async () => {
  let currentSettings = {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: ['beef'],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  };
  const runner = kitchen.createKitchenSettingsActionRunner?.({
    isConnected: () => true,
    readSettings: () => currentSettings,
    writeSettings: (settings) => { currentSettings = settings; },
    setControlPending() {},
    renderSettings() {},
    notify() {},
  });

  await runner.run({
    key: 'product:doner',
    checked: false,
    optimisticUpdate: (settings) => ({
      ...settings,
      stoppedProductIds: ['doner'],
    }),
    action: async () => ({ productId: 'doner', available: false }),
    successMessage: 'Донер отключён',
  });

  assert.deepEqual(currentSettings.stoppedProductIds, ['doner']);
  assert.deepEqual(currentSettings.stoppedMeatIds, ['beef']);
});

test('retry resolves the current visible switch after the menu rerenders', async () => {
  let currentSettings = {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  };
  let currentControl = { id: 'first-control' };
  let attempt = 0;
  let retryAction;
  const pendingChanges = [];
  const runner = kitchen.createKitchenSettingsActionRunner?.({
    isConnected: () => true,
    readSettings: () => currentSettings,
    writeSettings: (settings) => { currentSettings = settings; },
    resolveControl: () => currentControl,
    setControlPending: (_key, pending, _checked, control) => {
      pendingChanges.push({ pending, control });
    },
    renderSettings: () => { currentControl = { id: 'replacement-control' }; },
    notify: (_message, tone, action) => {
      if (tone === 'error') retryAction = action;
    },
  });

  const request = {
    key: 'product:doner',
    checked: false,
    optimisticUpdate: (settings) => ({ ...settings, stoppedProductIds: ['doner'] }),
    action: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('Сеть недоступна');
      return { productId: 'doner', available: false };
    },
    successMessage: 'Донер отключён',
  };

  await runner.run(request);
  assert.equal(retryAction.label, 'Повторить');
  await retryAction.onClick();

  const retryPending = pendingChanges.find(
    ({ pending, control }) => pending && control?.id === 'replacement-control',
  );
  assert.ok(retryPending, 'retry must mark the replacement control pending');
  assert.equal(attempt, 2);
});

test('category and its product cannot race while unrelated controls stay available', async () => {
  let currentSettings = {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  };
  let resolveCategory;
  let productCalls = 0;
  let meatCalls = 0;
  const runner = kitchen.createKitchenSettingsActionRunner?.({
    isConnected: () => true,
    readSettings: () => currentSettings,
    writeSettings: (settings) => { currentSettings = settings; },
    setControlPending() {},
    renderSettings() {},
    notify() {},
  });

  const category = runner.run({
    key: 'category:shawarma',
    lockKeys: ['product:classic-shawarma'],
    checked: false,
    optimisticUpdate: (settings) => ({
      ...settings,
      stoppedProductIds: ['classic-shawarma'],
    }),
    action: () => new Promise((resolve) => { resolveCategory = resolve; }),
    successMessage: 'Категория отключена',
  });
  const overlappingProduct = await runner.run({
    key: 'product:classic-shawarma',
    lockKeys: ['category:shawarma'],
    checked: true,
    optimisticUpdate: (settings) => ({ ...settings, stoppedProductIds: [] }),
    action: async () => { productCalls += 1; },
    successMessage: 'Блюдо включено',
  });
  const unrelatedMeat = runner.run({
    key: 'option:meat:beef',
    checked: false,
    optimisticUpdate: (settings) => ({ ...settings, stoppedMeatIds: ['beef'] }),
    action: async () => { meatCalls += 1; },
    successMessage: 'Говядина отключена',
  });

  assert.equal(overlappingProduct, false);
  assert.equal(productCalls, 0);
  assert.equal(meatCalls, 1);
  resolveCategory({ categoryId: 'shawarma', available: false });
  await Promise.all([category, unrelatedMeat]);
});
