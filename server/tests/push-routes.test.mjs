import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';

const db = { query: async () => ({ rows: [{ ok: 1 }] }) };
const authService = {
  authenticate: async (token) => {
    if (token === 'owner') return { id: 'owner-1', role: 'owner' };
    if (token === 'courier') return { id: 'courier-1', role: 'courier' };
    if (token === 'kitchen') return { id: 'kitchen-1', role: 'kitchen' };
    return null;
  },
};
const cookie = (token) => `pivdoner_session=${token}`;

const createPushServiceStub = () => {
  const calls = [];
  return {
    calls,
    service: {
      getPublicKey: () => 'BPublicVapidKey',
      subscribe: async (...args) => calls.push(['subscribe', ...args]),
      unsubscribe: async (...args) => calls.push(['unsubscribe', ...args]),
    },
  };
};

test('push API rejects anonymous requests', async () => {
  const { service } = createPushServiceStub();
  const app = createApp({ db, authService, pushService: service });

  const response = await request(app).get('/api/push/public-key');

  assert.equal(response.status, 401);
});

test('courier and owner can read the public VAPID key', async () => {
  const { service } = createPushServiceStub();
  const app = createApp({ db, authService, pushService: service });

  const courier = await request(app)
    .get('/api/push/public-key')
    .set('Cookie', cookie('courier'));
  const owner = await request(app)
    .get('/api/push/public-key')
    .set('Cookie', cookie('owner'));

  assert.equal(courier.status, 200);
  assert.deepEqual(courier.body, { publicKey: 'BPublicVapidKey' });
  assert.equal(owner.status, 200);
});

test('valid subscription is stored for the authenticated account', async () => {
  const { service, calls } = createPushServiceStub();
  const app = createApp({ db, authService, pushService: service });
  const subscription = {
    endpoint: 'https://push.example/device-1',
    keys: { p256dh: 'public-key-value', auth: 'auth-key-value' },
  };

  const response = await request(app)
    .post('/api/push/subscriptions')
    .set('Cookie', cookie('courier'))
    .set('User-Agent', 'Courier Tablet')
    .send(subscription);

  assert.equal(response.status, 204);
  assert.deepEqual(calls, [
    ['subscribe', { id: 'courier-1', role: 'courier' }, subscription, 'Courier Tablet'],
  ]);
});

test('malformed push endpoint or keys receive 400', async () => {
  const { service, calls } = createPushServiceStub();
  const app = createApp({ db, authService, pushService: service });

  const malformed = await request(app)
    .post('/api/push/subscriptions')
    .set('Cookie', cookie('courier'))
    .send({ endpoint: 'not-a-url', keys: { p256dh: '', auth: '' } });

  assert.equal(malformed.status, 400);
  assert.equal(calls.length, 0);
});

test('DELETE removes only the authenticated account endpoint', async () => {
  const { service, calls } = createPushServiceStub();
  const app = createApp({ db, authService, pushService: service });

  const response = await request(app)
    .delete('/api/push/subscriptions')
    .set('Cookie', cookie('courier'))
    .send({ endpoint: 'https://push.example/device-1' });

  assert.equal(response.status, 204);
  assert.deepEqual(calls, [
    ['unsubscribe', { id: 'courier-1', role: 'courier' }, 'https://push.example/device-1'],
  ]);
});

test('kitchen role cannot use courier push API', async () => {
  const { service } = createPushServiceStub();
  const app = createApp({ db, authService, pushService: service });

  const response = await request(app)
    .get('/api/push/public-key')
    .set('Cookie', cookie('kitchen'));

  assert.equal(response.status, 403);
});
