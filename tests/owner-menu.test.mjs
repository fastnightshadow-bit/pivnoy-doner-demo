import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';
import { CATEGORIES, PRODUCTS } from '../catalog-data.js';
import {
  buildCategorySummaries,
  filterOwnerMenu,
  getCategoryProductIds,
  getGlobalMeatOptions,
  getProductOptionGroups,
} from '../owner-menu.js';

test('панель владельца группирует товары по категориям и считает стоп-лист', () => {
  const categories = buildCategorySummaries({
    categories: CATEGORIES,
    products: PRODUCTS,
    stoppedProductIds: ['classic-shawarma', 'nuggets'],
  });

  const shawarma = categories.find(({ id }) => id === 'shawarma');
  const snacks = categories.find(({ id }) => id === 'snacks');
  const drinks = categories.find(({ id }) => id === 'drinks');

  assert.deepEqual(
    {
      productCount: shawarma.productCount,
      stoppedCount: shawarma.stoppedCount,
      allAvailable: shawarma.allAvailable,
    },
    { productCount: 7, stoppedCount: 1, allAvailable: false },
  );
  assert.equal(snacks.stoppedCount, 1);
  assert.equal(drinks.productCount, 0);
});

test('поиск находит и категорию, и отдельный товар', () => {
  const categories = buildCategorySummaries({
    categories: CATEGORIES,
    products: PRODUCTS,
    stoppedProductIds: [],
  });

  const byCategory = filterOwnerMenu(categories, 'шаурма');
  const byProduct = filterOwnerMenu(categories, 'наггетсы');

  assert.deepEqual(
    byCategory.map(({ id, products }) => ({
      id,
      products: products.map(({ id: productId }) => productId),
    })),
    [
      {
        id: 'shawarma',
        products: [
          'classic-shawarma',
          'tasty-shawarma',
          'curry-shawarma',
          'burger-shawarma',
          'bbq-shawarma',
          'truffle-shawarma',
          'four-cheese-shawarma',
        ],
      },
      { id: 'vegan', products: ['falafel-shawarma'] },
    ],
  );
  assert.equal(byProduct.length, 1);
  assert.equal(byProduct[0].id, 'snacks');
  assert.deepEqual(byProduct[0].products.map(({ id }) => id), ['nuggets']);
});

test('у товара показываются только подходящие группы настроек', () => {
  const shawarma = getProductOptionGroups('classic-shawarma');
  const snack = getProductOptionGroups('nuggets');
  const burger = getProductOptionGroups('burger-standard');

  assert.deepEqual(shawarma.map(({ kind }) => kind), ['meat', 'addon']);
  assert.equal(shawarma.find(({ kind }) => kind === 'addon').options.length, 5);
  assert.deepEqual(snack.map(({ kind }) => kind), ['sauce']);
  assert.equal(snack[0].options.length, 10);
  assert.deepEqual(burger, []);
});

test('переключение категории получает точный список её товаров', () => {
  assert.deepEqual(
    getCategoryProductIds('doner', PRODUCTS),
    ['doner', 'doner-box'],
  );
});

test('в начале меню владельца доступны отдельные глобальные переключатели мяса', () => {
  assert.deepEqual(
    getGlobalMeatOptions({ stoppedMeatIds: ['beef'] }),
    [
      { id: 'chicken', label: 'Курица', available: true },
      { id: 'beef', label: 'Говядина', available: false },
    ],
  );
});

test('панель владельца содержит отдельный блок мяса и аккуратные шевроны', () => {
  const html = readText('owner.html');
  const css = readText('owner.css');

  assert.match(html, /data-owner-global-meats/);
  assert.match(css, /\.owner-chevron/);
  assert.match(css, /\.owner-service-card__copy/);
});
