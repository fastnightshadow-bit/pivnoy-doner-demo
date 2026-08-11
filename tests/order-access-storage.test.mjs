import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_ORDER_ACCESS_STORAGE_KEY,
  loadActiveOrderAccess,
  saveActiveOrderAccess,
} from '../order-storage.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('active order credentials survive reload without entering the URL', () => {
  const storage = createStorage();

  saveActiveOrderAccess(storage, { id: 'order-1', token: 'secret-token' });

  assert.deepEqual(loadActiveOrderAccess(storage), {
    id: 'order-1',
    token: 'secret-token',
  });
  assert.deepEqual(JSON.parse(storage.getItem(ACTIVE_ORDER_ACCESS_STORAGE_KEY)), {
    id: 'order-1',
    token: 'secret-token',
  });
});

test('invalid or incomplete active order credentials are rejected', () => {
  const storage = createStorage();
  storage.setItem(
    ACTIVE_ORDER_ACCESS_STORAGE_KEY,
    JSON.stringify({ id: 'order-1', token: '' }),
  );

  assert.equal(loadActiveOrderAccess(storage), null);
  assert.throws(
    () => saveActiveOrderAccess(storage, { id: 'order-1', token: '' }),
    /active-order-access-invalid/,
  );
});

test('credential persistence fails closed when browser storage is unavailable', () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota-exceeded');
    },
  };

  assert.throws(
    () =>
      saveActiveOrderAccess(storage, {
        id: 'order-1',
        token: 'secret-token',
      }),
    /quota-exceeded/,
  );
});

test('production checkout requires and persists both returned credentials', async () => {
  const checkout = await import('../checkout.js');
  const storage = createStorage();

  assert.deepEqual(
    checkout.saveCreatedOrderAccess(storage, {
      id: 'order-1',
      accessToken: 'secret-token',
    }),
    { id: 'order-1', token: 'secret-token' },
  );
  assert.throws(
    () => checkout.saveCreatedOrderAccess(storage, { id: 'order-2' }),
    /order-access-unavailable/,
  );
});

test('checkout explains when secure order access cannot be stored', async () => {
  const checkout = await import('../checkout.js');
  const blockedStorage = {
    setItem: () => {
      throw new Error('quota-exceeded');
    },
  };

  let error;
  try {
    checkout.saveCreatedOrderAccess(blockedStorage, {
      id: 'order-1',
      accessToken: 'secret-token',
    });
  } catch (caught) {
    error = caught;
  }

  assert.equal(error.code, 'ACTIVE_ORDER_ACCESS_STORAGE_FAILED');
  assert.match(
    checkout.getCheckoutSubmissionErrorMessage(error),
    /не удалось сохранить доступ к заказу/i,
  );
  assert.match(
    checkout.getCheckoutSubmissionErrorMessage(error),
    /оформление остановлено/i,
  );
});
