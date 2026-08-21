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
      stoppedAddonIds: ['onion', 'onion', ''],
    }),
    {
      acceptingOrders: false,
      stoppedProductIds: ['doner', 'fries'],
      stoppedMeatIds: ['beef'],
      stoppedSauceIds: ['bbq', 'tasty'],
      stoppedAddonIds: ['onion'],
    },
  );
});

test('мясо, соусы и добавки переключаются независимо от блюд', () => {
  const settings = normalizeKitchenSettings();
  const withoutBeef = toggleStoppedOption(settings, 'meat', 'beef');
  const withoutSauce = toggleStoppedOption(withoutBeef, 'sauce', 'tasty');
  const withoutAddon = toggleStoppedOption(withoutSauce, 'addon', 'onion');

  assert.deepEqual(withoutAddon.stoppedMeatIds, ['beef']);
  assert.deepEqual(withoutAddon.stoppedSauceIds, ['tasty']);
  assert.deepEqual(withoutAddon.stoppedAddonIds, ['onion']);
  assert.deepEqual(withoutAddon.stoppedProductIds, []);
  assert.deepEqual(
    toggleStoppedOption(withoutAddon, 'meat', 'beef').stoppedMeatIds,
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
