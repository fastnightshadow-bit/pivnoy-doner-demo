import test from 'node:test';
import assert from 'node:assert/strict';

import { runLoadTest } from '../scripts/load-test.mjs';

test('load scenario performs 100 reads and creates exactly 50 unique orders', async () => {
  const calls = [];
  let orderNumber = 0;
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if ((options.method ?? 'GET') === 'POST') {
      orderNumber += 1;
      const orderId = `order-${orderNumber}`;
      return {
        status: 201,
        ok: true,
        json: async () => ({ id: orderId }),
      };
    }
    return { status: 200, ok: true, json: async () => ({}) };
  };

  const result = await runLoadTest({
    baseUrl: 'https://stage.pivdoner.ru',
    fetcher,
    readCount: 100,
    orderCount: 50,
    p95LimitMs: 1000,
  });

  assert.equal(calls.length, 150);
  assert.equal(result.serverErrors, 0);
  assert.equal(result.uniqueOrders, 50);
  assert.ok(result.p95Ms < 1000);
});

test('load scenario refuses the production domain without explicit permission', async () => {
  await assert.rejects(
    runLoadTest({ baseUrl: 'https://pivdoner.ru', fetcher: async () => null }),
    /REFUSING_PRODUCTION_LOAD_TEST/,
  );
});
