import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeKitchenSettings,
  toggleStoppedOption,
  toggleStoppedProduct,
} from '../kitchen-settings.js';

test('настройки кухни нормализуют приём заказов и уникальный стоп-лист', () => {
  assert.deepEqual(
    normalizeKitchenSettings({
      acceptingOrders: false,
      stoppedProductIds: ['doner', 'doner', '', 'fries'],
      stoppedMeatIds: ['beef', 'beef', ''],
      stoppedSauceIds: ['tasty', 'bbq', 'tasty'],
    }),
    {
      acceptingOrders: false,
      stoppedProductIds: ['doner', 'fries'],
      stoppedMeatIds: ['beef'],
      stoppedSauceIds: ['bbq', 'tasty'],
    },
  );
});

test('мясо и соусы переключаются независимо от блюд', () => {
  const settings = normalizeKitchenSettings();
  const withoutBeef = toggleStoppedOption(settings, 'meat', 'beef');
  const withoutSauce = toggleStoppedOption(withoutBeef, 'sauce', 'tasty');

  assert.deepEqual(withoutSauce.stoppedMeatIds, ['beef']);
  assert.deepEqual(withoutSauce.stoppedSauceIds, ['tasty']);
  assert.deepEqual(withoutSauce.stoppedProductIds, []);
  assert.deepEqual(
    toggleStoppedOption(withoutSauce, 'meat', 'beef').stoppedMeatIds,
    [],
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
