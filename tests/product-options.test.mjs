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

test('каждое блюдо получает один бесплатный соус по умолчанию', () => {
  for (const product of PRODUCTS) {
    const config = getProductConfiguration(product.id);
    assert.deepEqual(config.sauces, Object.keys(PRODUCT_SAUCES), product.id);
    assert.ok(config.sauces.includes(config.defaultSauce), product.id);
    const priceWithoutSauce = calculateProductPrice(product.id, {});
    const priceWithSauce = calculateProductPrice(product.id, {
      sauce: config.defaultSauce,
    });
    assert.equal(priceWithSauce, priceWithoutSauce, product.id);
  }
});

test('соус входит в идентичность позиции корзины', () => {
  const base = {
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 300,
  };
  const tasty = createCartLine({ ...base, sauce: 'Тейсти' });
  const chili = createCartLine({ ...base, sauce: 'Чили' });
  assert.equal(tasty.sauce, 'Тейсти');
  assert.notEqual(tasty.lineId, chili.lineId);
  assert.equal(tasty.lineId, getLineSignature(tasty));
});

test('карточка блюда показывает выбор одного соуса', () => {
  const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
  const markup = createProductSheetMarkup(product, { sauce: 'chili' });
  assert.match(markup, />Соус</);
  assert.match(markup, /data-sheet-sauce="chili"/);
  assert.match(markup, /data-sheet-sauce="chili"[^>]*[\s\S]*?Чили/);
  assert.match(markup, /Входит в стоимость/);
});

test('соус сохраняется в заказе и показывается кухне', () => {
  const order = normalizeOrder({
    id: 'order-1',
    number: '0001',
    createdAt: '2026-08-05T10:00:00.000Z',
    items: [{ name: 'Донер', quantity: 1, sauce: 'Барбекю' }],
  });
  assert.equal(order.items[0].sauce, 'Барбекю');
  assert.deepEqual(getKitchenItemOptions(order.items[0]), ['Соус: Барбекю']);
});
