import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../catalog-data.js';
import {
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
  calculateProductPrice,
  getProductConfiguration,
} from '../product-config.js';
import { createCartLine, getLineSignature } from '../cart-state.js';
import { loadCart } from '../cart-storage.js';
import { createProductSheetMarkup } from '../product-sheet.js';
import { normalizeOrder } from '../order-state.js';
import { getKitchenItemOptions } from '../kitchen-presentation.js';

test('список соусов совпадает с утвержденным меню', () => {
  assert.deepEqual(
    Object.values(PRODUCT_SAUCES).map(({ label }) => label),
    [
      'Тейсти',
      'Бургерный',
      'Сырный',
      'Барбекю',
      'Трюфель',
      'Кетчуп',
      'Карри',
      'Блю чиз',
      'Горчица',
      'Чили',
    ],
  );
});

test('в добавках используется жареный лук', () => {
  assert.equal(PRODUCT_ADDONS.onion.label, 'Жареный лук');
});

test('каждый соус стоит 50 ₽ и по умолчанию ничего не выбрано', () => {
  assert.ok(
    Object.values(PRODUCT_SAUCES).every(({ price }) => price === 50),
  );

  for (const product of PRODUCTS) {
    const config = getProductConfiguration(product.id);
    assert.deepEqual(config.sauces, Object.keys(PRODUCT_SAUCES), product.id);
    assert.equal(config.defaultSauce, undefined, product.id);
  }

  const baseSelection = { meat: 'chicken', size: 'standard' };
  assert.equal(
    calculateProductPrice('classic-shawarma', baseSelection),
    300,
  );
  assert.equal(
    calculateProductPrice('classic-shawarma', {
      ...baseSelection,
      sauces: ['tasty', 'chili'],
    }),
    400,
  );
});

test('несколько соусов входят в идентичность позиции корзины', () => {
  const base = {
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 300,
  };
  const tasty = createCartLine({ ...base, sauces: ['Тейсти'] });
  const tastyAndChili = createCartLine({
    ...base,
    sauces: ['Чили', 'Тейсти'],
  });
  assert.deepEqual(tasty.sauces, ['Тейсти']);
  assert.deepEqual(tastyAndChili.sauces, ['Тейсти', 'Чили']);
  assert.notEqual(tasty.lineId, tastyAndChili.lineId);
  assert.equal(tastyAndChili.lineId, getLineSignature(tastyAndChili));
});

test('старая строка sauce преобразуется в массив sauces', () => {
  const base = {
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 350,
  };
  const migrated = createCartLine({ ...base, sauce: 'Тейсти' });
  const modern = createCartLine({ ...base, sauces: ['Тейсти'] });
  assert.deepEqual(migrated.sauces, ['Тейсти']);
  assert.equal(migrated.lineId, modern.lineId);
});

test('старая сохранённая корзина мигрирует при чтении', () => {
  const storage = {
    getItem: () =>
      JSON.stringify([
        {
          productId: 'classic-shawarma',
          name: 'Классическая шаурма',
          unitPrice: 350,
          sauce: 'Тейсти',
          quantity: 2,
        },
      ]),
  };
  assert.deepEqual(loadCart(storage)[0].sauces, ['Тейсти']);
});

test('карточка блюда показывает выбор одного соуса', () => {
  const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
  const markup = createProductSheetMarkup(product, { sauce: 'chili' });
  assert.match(markup, />Соус</);
  assert.match(markup, /data-sheet-sauce="chili"/);
  assert.match(markup, /data-sheet-sauce="chili"[^>]*[\s\S]*?Чили/);
  assert.match(markup, /Входит в стоимость/);
});

test('несколько соусов сохраняются в заказе и показываются кухне', () => {
  const order = normalizeOrder({
    id: 'order-1',
    number: '0001',
    createdAt: '2026-08-05T10:00:00.000Z',
    items: [
      {
        name: 'Донер',
        quantity: 1,
        sauces: ['Барбекю', 'Чили'],
      },
    ],
  });
  assert.deepEqual(order.items[0].sauces, ['Барбекю', 'Чили']);
  assert.deepEqual(getKitchenItemOptions(order.items[0]), [
    'Соусы: Барбекю, Чили',
  ]);
});
