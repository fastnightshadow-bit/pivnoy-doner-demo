import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import {
  createKioskAuthService,
  hashKioskToken,
} from '../src/auth/kiosk-session.js';

const createRepository = () => {
  const activations = new Map();
  const devices = new Map();
  return {
    async saveActivation(record) {
      activations.set(record.codeHash, { ...record, consumedAt: null });
    },
    async consumeActivation({ codeHash, now, device }) {
      const activation = activations.get(codeHash);
      if (
        !activation ||
        activation.consumedAt ||
        new Date(activation.expiresAt).getTime() <= new Date(now).getTime()
      ) return null;
      activation.consumedAt = now;
      devices.set(device.tokenHash, device);
      return device;
    },
    async findActiveByTokenHash(tokenHash) {
      return devices.get(tokenHash) || null;
    },
    async touch() {},
  };
};

const createService = (repository = createRepository()) =>
  createKioskAuthService({
    repository,
    now: () => new Date('2026-08-30T10:00:00.000Z'),
    createCode: () => '123456',
    createToken: () => 'kiosk-secret-token',
    createId: () => '00000000-0000-4000-8000-000000000006',
  });

test('одноразовый код активирует только один планшет и хранит хэш токена', async () => {
  const repository = createRepository();
  const service = createService(repository);
  const activation = await service.createActivation({ id: 'owner-1' });

  assert.equal(activation.code, '123456');
  assert.equal(activation.expiresAt, '2026-08-30T10:10:00.000Z');
  const activated = await service.activate('123456', 'Киоск у кассы');
  assert.equal(activated.token, 'kiosk-secret-token');
  assert.equal(activated.device.displayName, 'Киоск у кассы');
  assert.equal(
    (await repository.findActiveByTokenHash(hashKioskToken(activated.token)))
      .tokenHash,
    hashKioskToken('kiosk-secret-token'),
  );
  assert.equal(await service.activate('123456', 'Второй планшет'), null);
});

test('активация выставляет защищённую host-only cookie', async () => {
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    kioskAuthService: createService(),
    nodeEnv: 'production',
  });
  await app.locals.kioskAuthService.createActivation({ id: 'owner-1' });

  const response = await request(app)
    .post('/api/kiosk/activate')
    .send({ code: '123456', displayName: 'Главный киоск' });

  assert.equal(response.status, 200);
  assert.match(response.headers['set-cookie'][0], /pivdoner_kiosk=/);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(response.headers['set-cookie'][0], /Secure/i);
  assert.match(response.headers['set-cookie'][0], /SameSite=Strict/i);
  assert.doesNotMatch(response.headers['set-cookie'][0], /Domain=/i);
  assert.doesNotMatch(response.text, /kiosk-secret-token/);
});

test('активированный планшет получает безопасную сессию', async () => {
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    kioskAuthService: createService(),
  });
  await app.locals.kioskAuthService.createActivation({ id: 'owner-1' });
  const agent = request.agent(app);
  await agent.post('/api/kiosk/activate').send({
    code: '123456',
    displayName: 'Главный киоск',
  });

  const response = await agent.get('/api/kiosk/session');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    authenticated: true,
    device: {
      id: '00000000-0000-4000-8000-000000000006',
      displayName: 'Главный киоск',
    },
  });
  assert.doesNotMatch(response.text, /token|hash/i);
});

test('только владелец создаёт короткоживущий код подключения', async () => {
  const kioskAuthService = createService();
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    authService: {
      authenticate: async (token) => token === 'owner-session'
        ? { id: 'owner-1', displayName: 'Владелец', role: 'owner' }
        : null,
    },
    dashboardService: { get: async () => ({}) },
    kioskAuthService,
  });

  const denied = await request(app).post('/api/owner/kiosk-activation');
  assert.equal(denied.status, 401);

  const response = await request(app)
    .post('/api/owner/kiosk-activation')
    .set('Cookie', 'pivdoner_session=owner-session');
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    code: '123456',
    expiresAt: '2026-08-30T10:10:00.000Z',
  });
});
