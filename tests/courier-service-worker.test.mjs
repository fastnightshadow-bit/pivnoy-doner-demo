import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { extractJson, readText } from './helpers.mjs';

const createWorkerHarness = ({ windows = [] } = {}) => {
  const listeners = new Map();
  const notifications = [];
  const opened = [];
  const clientsApi = {
    claim: async () => {},
    matchAll: async () => windows,
    openWindow: async (url) => {
      opened.push(url);
      return { url };
    },
  };
  const self = {
    location: {
      origin: 'https://pivdoner.ru',
      href: 'https://pivdoner.ru/courier-sw.js',
    },
    registration: {
      showNotification: async (title, options) => notifications.push({ title, options }),
    },
    clients: clientsApi,
    skipWaiting: () => {},
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const caches = {
    open: async () => ({ addAll: async () => {}, put: async () => {} }),
    keys: async () => [],
    delete: async () => true,
    match: async () => null,
  };

  vm.runInNewContext(readText('courier-sw.js'), {
    self,
    clients: clientsApi,
    caches,
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    URL,
    Promise,
  });

  return { listeners, notifications, opened };
};

const dispatchAndWait = async (listener, event) => {
  let operation;
  listener({
    ...event,
    waitUntil: (promise) => {
      operation = promise;
    },
  });
  await operation;
};

test('courier PWA opens the real application without demo mode', () => {
  const manifest = extractJson('courier.webmanifest');
  assert.equal(manifest.start_url, './courier.html');
  assert.doesNotMatch(readText('courier-sw.js'), /courier\.html\?demo=1/);
});

test('background push shows one privacy-safe courier order notification', async () => {
  const { listeners, notifications } = createWorkerHarness();
  const payload = {
    orderId: 'order-1',
    number: '1464',
    eta: { min: 12, max: 18 },
    address: 'Волоколамское шоссе 71/22 к.2 · этаж 3 · кв. 15',
    url: '/courier.html',
  };

  await dispatchAndWait(listeners.get('push'), {
    data: { json: () => payload },
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, 'Новый заказ #1464');
  assert.match(notifications[0].options.body, /12–18 мин/);
  assert.match(notifications[0].options.body, /Волоколамское шоссе/);
  assert.equal(notifications[0].options.tag, 'courier-order-order-1');
  assert.equal(notifications[0].options.data.url, 'https://pivdoner.ru/courier.html');
  assert.equal(notifications[0].options.icon, 'assets/courier/icon-192.png');
  assert.doesNotMatch(JSON.stringify(notifications[0]), /телефон|phone/i);
});

test('notification click focuses an existing courier window', async () => {
  let focused = 0;
  const existing = {
    url: 'https://pivdoner.ru/courier.html',
    focus: async () => {
      focused += 1;
    },
  };
  const { listeners, opened } = createWorkerHarness({ windows: [existing] });

  await dispatchAndWait(listeners.get('notificationclick'), {
    notification: {
      data: { url: '/courier.html' },
      close: () => {},
    },
  });

  assert.equal(focused, 1);
  assert.deepEqual(opened, []);
});

test('notification click opens the production courier page when none is open', async () => {
  const { listeners, opened } = createWorkerHarness();

  await dispatchAndWait(listeners.get('notificationclick'), {
    notification: {
      data: { url: '/courier.html' },
      close: () => {},
    },
  });

  assert.deepEqual(opened, ['https://pivdoner.ru/courier.html']);
});
