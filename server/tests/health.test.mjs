import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /api/health возвращает состояние сервиса', async () => {
  const db = {
    query: async () => ({ rows: [{ ok: 1 }] }),
  };
  const response = await request(createApp({ db })).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, database: 'up' });
});

test('GET /api/health сообщает о недоступной базе без раскрытия деталей', async () => {
  const db = {
    query: async () => {
      throw new Error('postgres password must stay private');
    },
  };
  const response = await request(createApp({ db })).get('/api/health');

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { ok: false, database: 'down' });
  assert.doesNotMatch(response.text, /password/i);
});
