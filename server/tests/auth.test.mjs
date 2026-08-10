import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/auth/session.js';

const createAuthRepository = async () => {
  const account = {
    id: 'account-kitchen',
    displayName: 'Кухня',
    role: 'kitchen',
    pinHash: await argon2.hash('2468', { type: argon2.argon2id }),
  };
  const sessions = new Map();
  return {
    findActiveAccountByRole: async (role) => (role === account.role ? account : null),
    createSession: async (session) => sessions.set(session.tokenHash, session),
    findSession: async (tokenHash) => {
      const session = sessions.get(tokenHash);
      return session ? { ...session, ...account } : null;
    },
    deleteSession: async (tokenHash) => sessions.delete(tokenHash),
  };
};

test('правильный PIN создаёт защищённую cookie', async () => {
  const authService = createAuthService({ repository: await createAuthRepository() });
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    authService,
    nodeEnv: 'production',
  });

  const response = await request(app)
    .post('/api/auth/login')
    .send({ role: 'kitchen', pin: '2468' });

  assert.equal(response.status, 204);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(response.headers['set-cookie'][0], /SameSite=Lax/i);
  assert.match(response.headers['set-cookie'][0], /Secure/i);
  assert.doesNotMatch(response.headers['set-cookie'][0], /2468/);
});

test('неверный PIN не сообщает, существует ли роль', async () => {
  const authService = createAuthService({ repository: await createAuthRepository() });
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    authService,
  });

  const wrongPin = await request(app)
    .post('/api/auth/login')
    .send({ role: 'kitchen', pin: '0000' });
  const wrongRole = await request(app)
    .post('/api/auth/login')
    .send({ role: 'courier', pin: '0000' });

  assert.equal(wrongPin.status, 401);
  assert.equal(wrongRole.status, 401);
  assert.deepEqual(wrongPin.body, wrongRole.body);
});

test('сессия возвращает роль, но не PIN и не хеш', async () => {
  const authService = createAuthService({ repository: await createAuthRepository() });
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    authService,
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ role: 'kitchen', pin: '2468' });

  const response = await agent.get('/api/auth/session');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    authenticated: true,
    account: { id: 'account-kitchen', displayName: 'Кухня', role: 'kitchen' },
  });
  assert.doesNotMatch(response.text, /pin|hash|2468/i);
});
