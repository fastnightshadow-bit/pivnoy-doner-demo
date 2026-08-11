import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getHomeActiveOrderAccess } from '../home.js';
import { saveActiveOrderAccess } from '../order-storage.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};

test('home production active-order card requires the credential record', () => {
  const storage = createStorage();
  storage.setItem('pivnoy-doner-active-order-id-v1', 'legacy-order');

  assert.equal(getHomeActiveOrderAccess(storage), null);

  saveActiveOrderAccess(storage, {
    id: 'order-1',
    token: 'secret-token',
  });
  assert.deepEqual(getHomeActiveOrderAccess(storage), {
    id: 'order-1',
    token: 'secret-token',
  });
});

test('home production subscription passes id and token separately', async () => {
  const source = await readFile(new URL('../home.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /loadActiveOrderId/);
  assert.match(
    source,
    /clientApi\.subscribeToOrder\(\s*activeOrderAccess\.id,\s*activeOrderAccess\.token,/s,
  );
  assert.doesNotMatch(source, /clientApi\.getOrder\(activeOrderAccess\.id\)/);
});
