import assert from 'node:assert/strict';
import test from 'node:test';

import { createCourierApi } from '../courier-api.js';
import {
  createCourierPushManager,
  urlBase64ToUint8Array,
} from '../courier-push.js';

const response = (body = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test('URL-safe VAPID public key converts to the browser byte array', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQIDBA')], [1, 2, 3, 4]);
  assert.deepEqual([...urlBase64ToUint8Array('____')], [255, 255, 255]);
});

test('courier API reads VAPID key and saves or removes one device endpoint', async () => {
  const calls = [];
  const api = createCourierApi({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/public-key')) return response({ publicKey: 'AQIDBA' });
      return response({}, 204);
    },
  });
  const subscription = {
    endpoint: 'https://push.example/device-1',
    keys: { p256dh: 'p256', auth: 'auth' },
  };

  assert.equal(await api.getPushPublicKey(), 'AQIDBA');
  await api.savePushSubscription(subscription);
  await api.deletePushSubscription(subscription.endpoint);

  assert.deepEqual(
    calls.map(({ url, options }) => [url, options.method ?? 'GET', options.body]),
    [
      ['/api/push/public-key', 'GET', undefined],
      ['/api/push/subscriptions', 'POST', JSON.stringify(subscription)],
      [
        '/api/push/subscriptions',
        'DELETE',
        JSON.stringify({ endpoint: subscription.endpoint }),
      ],
    ],
  );
});

test('explicit enable reuses an existing browser subscription and stores it on server', async () => {
  const stored = [];
  let subscribeCalls = 0;
  const existing = {
    endpoint: 'https://push.example/existing',
    toJSON: () => ({
      endpoint: 'https://push.example/existing',
      keys: { p256dh: 'p256', auth: 'auth' },
    }),
  };
  const manager = createCourierPushManager({
    api: {
      getPushPublicKey: async () => 'AQIDBA',
      savePushSubscription: async (value) => stored.push(value),
      deletePushSubscription: async () => {},
    },
    notificationApi: {
      permission: 'granted',
      requestPermission: async () => 'granted',
    },
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => existing,
          subscribe: async () => {
            subscribeCalls += 1;
            return existing;
          },
        },
      }),
    },
  });

  assert.deepEqual(await manager.enable(), { state: 'subscribed' });
  assert.equal(subscribeCalls, 0);
  assert.deepEqual(stored, [existing.toJSON()]);
});

test('enable creates a browser subscription only after the explicit call', async () => {
  let permissionRequests = 0;
  let subscribeCalls = 0;
  const created = {
    endpoint: 'https://push.example/new',
    toJSON: () => ({ endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } }),
  };
  const manager = createCourierPushManager({
    api: {
      getPushPublicKey: async () => 'AQIDBA',
      savePushSubscription: async () => {},
      deletePushSubscription: async () => {},
    },
    notificationApi: {
      permission: 'default',
      requestPermission: async () => {
        permissionRequests += 1;
        return 'granted';
      },
    },
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => null,
          subscribe: async ({ userVisibleOnly, applicationServerKey }) => {
            subscribeCalls += 1;
            assert.equal(userVisibleOnly, true);
            assert.deepEqual([...applicationServerKey], [1, 2, 3, 4]);
            return created;
          },
        },
      }),
    },
  });

  assert.equal(permissionRequests, 0);
  assert.equal(subscribeCalls, 0);
  assert.deepEqual(await manager.enable(), { state: 'subscribed' });
  assert.equal(permissionRequests, 1);
  assert.equal(subscribeCalls, 1);
});

test('disable removes only this endpoint on the server and browser', async () => {
  const calls = [];
  const subscription = {
    endpoint: 'https://push.example/current',
    unsubscribe: async () => calls.push('browser-unsubscribe'),
  };
  const manager = createCourierPushManager({
    api: {
      deletePushSubscription: async (endpoint) => calls.push(['server-delete', endpoint]),
    },
    notificationApi: { permission: 'granted' },
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: { getSubscription: async () => subscription },
      }),
    },
  });

  assert.deepEqual(await manager.disable(), { state: 'default' });
  assert.deepEqual(calls, [
    ['server-delete', subscription.endpoint],
    'browser-unsubscribe',
  ]);
});

test('unsupported and denied notifications return friendly states', async () => {
  const unsupported = createCourierPushManager({
    api: {},
    notificationApi: null,
    serviceWorker: null,
  });
  const denied = createCourierPushManager({
    api: {},
    notificationApi: {
      permission: 'denied',
      requestPermission: async () => 'denied',
    },
    serviceWorker: { ready: Promise.resolve({ pushManager: {} }) },
  });

  assert.deepEqual(await unsupported.getState(), { state: 'unsupported' });
  assert.deepEqual(await unsupported.enable(), { state: 'unsupported' });
  assert.deepEqual(await denied.getState(), { state: 'denied' });
  assert.deepEqual(await denied.enable(), { state: 'denied' });
});
