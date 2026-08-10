import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, PRODUCTS } from '../catalog-data.js';
import {
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
  calculateProductPrice,
  getProductConfiguration,
} from '../product-config.js';
import { createCartLine, getLineSignature } from '../cart-state.js';
import { loadCart } from '../cart-storage.js';
import { createProductSheetMarkup } from '../product-sheet.js';
import { createMenuProductCard } from '../home-menu.js';
import { createCartLineMarkup } from '../cart.js';
import { createOrderItemsMarkup } from '../order.js';
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

test('две порции жареного лука увеличивают цену на 100 ₽', () => {
  assert.equal(
    calculateProductPrice('classic-shawarma', {
      meat: 'chicken',
      size: 'standard',
      addons: { onion: 2 },
    }),
    400,
  );
});

test('количество добавок входит в идентичность позиции корзины', () => {
  const base = {
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
  };
  const one = createCartLine({
    ...base,
    unitPrice: 350,
    addons: { 'Жареный лук': 1 },
  });
  const two = createCartLine({
    ...base,
    unitPrice: 400,
    addons: { 'Жареный лук': 2 },
  });

  assert.deepEqual(two.addons, { 'Жареный лук': 2 });
  assert.notEqual(one.lineId, two.lineId);
});

test('старый массив добавок мигрирует как одна порция', () => {
  const storage = {
    getItem: () =>
      JSON.stringify([
        {
          productId: 'classic-shawarma',
          name: 'Классическая шаурма',
          unitPrice: 450,
          addons: ['Сыр', 'Жареный лук'],
        },
      ]),
  };

  assert.deepEqual(loadCart(storage)[0].addons, {
    'Жареный лук': 1,
    Сыр: 1,
  });
});

test('каждый соус стоит 50 ₽ и по умолчанию ничего не выбрано', () => {
  assert.ok(
    Object.values(PRODUCT_SAUCES).every(({ price }) => price === 50),
  );

  assert.deepEqual(
    getProductConfiguration('nuggets').sauces,
    Object.keys(PRODUCT_SAUCES),
  );
  assert.deepEqual(getProductConfiguration('classic-shawarma').sauces, []);
  assert.deepEqual(getProductConfiguration('doner').sauces, []);
  assert.deepEqual(getProductConfiguration('burger-standard').sauces, []);

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
    300,
  );
});

test('каталог содержит отдельную текстовую категорию соусов', () => {
  assert.ok(CATEGORIES.some(({ id }) => id === 'sauces'));
  const sauces = PRODUCTS.filter(({ category }) => category === 'sauces');

  assert.equal(sauces.length, Object.keys(PRODUCT_SAUCES).length);
  assert.deepEqual(
    sauces.map(({ name }) => name),
    Object.values(PRODUCT_SAUCES).map(({ label }) => label),
  );
  assert.ok(
    sauces.every(
      ({ image, price, textOnly, quickAdd }) =>
        !image && price === 50 && textOnly === true && quickAdd === true,
    ),
  );
});

test('соус в каталоге отображается строкой без фотографии', () => {
  const sauce = PRODUCTS.find(({ id }) => id === 'sauce-tasty');
  const markup = createMenuProductCard(sauce, 0);

  assert.match(markup, /menu-product--text/);
  assert.match(markup, /data-quick-add="sauce-tasty"/);
  assert.doesNotMatch(markup, /<img/);
});

test('несколько соусов входят в идентичность позиции корзины', () => {
  const base = {
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 300,
  };
  const tasty = createCartLine({ ...base, sauces: { Тейсти: 1 } });
  const tastyAndChili = createCartLine({
    ...base,
    sauces: { Чили: 1, Тейсти: 2 },
  });
  assert.deepEqual(tasty.sauces, { Тейсти: 1 });
  assert.deepEqual(tastyAndChili.sauces, { Тейсти: 2, Чили: 1 });
  assert.notEqual(tasty.lineId, tastyAndChili.lineId);
  assert.equal(tastyAndChili.lineId, getLineSignature(tastyAndChili));
});

test('старая строка sauce преобразуется в количество sauces', () => {
  const base = {
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 350,
  };
  const migrated = createCartLine({ ...base, sauce: 'Тейсти' });
  const modern = createCartLine({ ...base, sauces: ['Тейсти'] });
  assert.deepEqual(migrated.sauces, { Тейсти: 1 });
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
  assert.deepEqual(loadCart(storage)[0].sauces, { Тейсти: 1 });
});

test('карточка закуски показывает количественный выбор соусов', () => {
  const product = PRODUCTS.find(({ id }) => id === 'nuggets');
  const markup = createProductSheetMarkup(product, {
    sauces: { tasty: 2, chili: 1 },
  });
  assert.match(markup, />Соусы</);
  assert.match(markup, /data-sheet-sauce-change="tasty" data-delta="-1"/);
  assert.match(markup, /data-sheet-sauce-value="tasty"[^>]*>2</);
  assert.match(markup, /data-sheet-sauce-change="tasty" data-delta="1"/);
  assert.match(markup, /Тейсти[\s\S]*?\+50/);
});

test('карточки вне закусок не показывают выбор соуса', () => {
  const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
  const markup = createProductSheetMarkup(product);

  assert.doesNotMatch(markup, />Соусы</);
  assert.doesNotMatch(markup, /data-sheet-sauce=/);
});

test('количества соусов сохраняются в заказе и показываются кухне', () => {
  const order = normalizeOrder({
    id: 'order-1',
    number: '0001',
    createdAt: '2026-08-05T10:00:00.000Z',
    items: [
      {
        name: 'Донер',
        quantity: 1,
        sauces: { Барбекю: 2, Чили: 1 },
      },
    ],
  });
  assert.deepEqual(order.items[0].sauces, { Барбекю: 2, Чили: 1 });
  assert.deepEqual(getKitchenItemOptions(order.items[0]), [
    'Соусы: Барбекю ×2, Чили',
  ]);
});

test('корзина и активный заказ показывают все выбранные соусы', () => {
  const line = createCartLine({
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 400,
    sauces: { Тейсти: 2, Чили: 1 },
  });
  assert.match(createCartLineMarkup(line), /Соусы: Тейсти ×2, Чили/);
  assert.match(createOrderItemsMarkup([line]), /Соусы: Тейсти ×2, Чили/);
});

test('две порции соуса увеличивают цену закуски на 100 ₽', () => {
  assert.equal(calculateProductPrice('nuggets', { sauces: { tasty: 2 } }), 300);
});

test('карточка блюда показывает счётчик количества добавки', () => {
  const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
  const markup = createProductSheetMarkup(product, {
    meat: 'chicken',
    size: 'standard',
    addons: { onion: 2 },
  });

  assert.match(markup, /data-sheet-addon-change="onion" data-delta="-1"/);
  assert.match(markup, /data-sheet-addon-value="onion"[^>]*>2</);
  assert.match(markup, /data-sheet-addon-change="onion" data-delta="1"/);
});

test('две порции добавки видны в корзине, заказе и на кухне', () => {
  const line = createCartLine({
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 400,
    addons: { 'Жареный лук': 2 },
  });

  assert.match(createCartLineMarkup(line), /Добавки: Жареный лук ×2/);
  assert.match(createOrderItemsMarkup([line]), /Жареный лук ×2/);
  assert.deepEqual(getKitchenItemOptions(line), [
    'Добавки: Жареный лук ×2',
  ]);
});
