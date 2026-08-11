import test from 'node:test';
import assert from 'node:assert/strict';

test('production order repository can be loaded by the API process', async () => {
  const repository = await import('../src/repositories/orders.js');
  assert.equal(typeof repository.createOrdersRepository, 'function');
});
