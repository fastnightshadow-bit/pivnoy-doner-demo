import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeKitchenSettings,
  toggleStoppedProduct,
} from '../kitchen-settings.js';

test('настройки кухни нормализуют приём заказов и уникальный стоп-лист', () => {
  assert.deepEqual(
    normalizeKitchenSettings({
      acceptingOrders: false,
      stoppedProductIds: ['doner', 'doner', '', 'fries'],
    }),
    {
      acceptingOrders: false,
      stoppedProductIds: ['doner', 'fries'],
    },
  );
});

test('блюдо добавляется в стоп-лист и возвращается в продажу', () => {
  const stopped = toggleStoppedProduct(
    { acceptingOrders: true, stoppedProductIds: [] },
    'classic-shawarma',
  );
  assert.deepEqual(stopped.stoppedProductIds, ['classic-shawarma']);
  assert.deepEqual(
    toggleStoppedProduct(stopped, 'classic-shawarma').stoppedProductIds,
    [],
  );
});
