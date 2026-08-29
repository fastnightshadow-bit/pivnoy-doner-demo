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

test('соус не выбирается автоматически и каждый соус стоит 50 рублей', () => {
  for (const product of PRODUCTS) {
    const config = getProductConfiguration(product.id);
    assert.deepEqual(config.sauces, Object.keys(PRODUCT_SAUCES), product.id);
    assert.equal(config.defaultSauce, '', product.id);
    const meat = Object.keys(config.prices)[0];
    const size = Object.keys(config.prices[meat])[0];
    const priceWithoutSauce = calculateProductPrice(product.id, { meat, size });
    const priceWithSauce = calculateProductPrice(product.id, {
      meat,
      size,
      sauce: 'tasty',
    });
    assert.equal(priceWithSauce, priceWithoutSauce + 50, product.id);
  }

  assert.ok(Object.values(PRODUCT_SAUCES).every(({ price }) => price === 50));
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
  assert.match(markup, /Без соуса/);
  assert.match(markup, /\+50/);
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
