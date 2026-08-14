import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { applyCourierActionResult } from '../courier-state.js';

const readyOrder = {
  id: 'delivery-1',
  number: '13',
  status: 'ready',
  version: 6,
  promisedAt: '2026-08-14T10:20:00.000Z',
  phone: '+7 (900) 000-00-00',
  address: { street: 'Test street' },
};

test('successful courier action updates the visible order from the PATCH response', () => {
  const updated = applyCourierActionResult(
    [readyOrder],
    readyOrder.id,
    { id: readyOrder.id, status: 'courier', version: 7 },
  );

  assert.deepEqual(updated, [
    { ...readyOrder, status: 'handed_to_courier', version: 7 },
  ]);
});

test('successful delivery completion removes the order without a second GET', () => {
  const activeOrder = {
    ...readyOrder,
    status: 'handed_to_courier',
    version: 7,
  };
  const updated = applyCourierActionResult(
    [activeOrder],
    activeOrder.id,
    { id: activeOrder.id, status: 'completed', version: 8 },
  );

  assert.deepEqual(updated, []);
});

test('courier screen applies a successful PATCH response without awaiting another GET', async () => {
  const source = await readFile(new URL('../courier.js', import.meta.url), 'utf8');

  assert.match(source, /applyCourierActionResult\(currentOrders, orderId, result\)/);
  assert.match(
    source,
    /renderOrders\(currentOrders, new Date\(\)\.toISOString\(\)\)/,
  );
  assert.doesNotMatch(source, /await refreshOrdersAfterCurrent\(\);\s*\} catch/);
});
