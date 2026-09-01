import test from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORIES, PRODUCTS } from '../catalog-data.js';
import { createCartLine } from '../cart-state.js';
import {
  getKioskAvailability,
  reconcileKioskCart,
} from '../kiosk-availability.js';
import {
  getProductConfiguration,
  PRODUCT_SAUCES,
} from '../product-config.js';

const available = Object.freeze({
  acceptingOrders: true,
  stoppedProductIds: [],
  stoppedMeatIds: [],
  stoppedSauceIds: [],
  stoppedAddonIds: [],
});

test('киоск использует полное каноническое меню без собственной копии', () => {
  assert.equal(CATEGORIES.length, 8);
  assert.equal(PRODUCTS.length, 29);
  assert.deepEqual(getProductConfiguration('classic-shawarma').sauces, []);
  assert.deepEqual(getProductConfiguration('doner').sauces, []);
  assert.equal(
    getProductConfiguration('fries').sauces.length,
    Object.keys(PRODUCT_SAUCES).length,
  );
  assert.equal(
    PRODUCTS.filter(({ category }) => category === 'sauces').length,
    10,
  );
});

test('стоп-лист скрывает товар, если у него не осталось доступного мяса', () => {
  const nuggets = PRODUCTS.find(({ id }) => id === 'nuggets');
  assert.deepEqual(
    getKioskAvailability(nuggets, {}, {
      ...available,
      stoppedMeatIds: ['chicken'],
    }),
    { available: false, reason: 'Временно нет в наличии' },
  );
});

test('корзина удаляет остановленный товар и очищает остановленные опции', () => {
  const shawarma = createCartLine({
    productId: 'classic-shawarma',
    name: 'Классическая шаурма',
    unitPrice: 450,
    meat: 'chicken',
    size: 'standard',
    addons: { cheese: 1, onion: 1 },
    quantity: 1,
  });
  const fries = createCartLine({
    productId: 'fries',
    name: 'Картофель фри',
    unitPrice: 300,
    sauces: { tasty: 1, chili: 1 },
    quantity: 2,
  });

  const result = reconcileKioskCart([shawarma, fries], {
    ...available,
    stoppedAddonIds: ['onion'],
    stoppedSauceIds: ['chili'],
  });

  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines[0].addons, { cheese: 1 });
  assert.equal(result.lines[0].unitPrice, 400);
  assert.deepEqual(result.lines[1].sauces, { tasty: 1 });
  assert.equal(result.lines[1].unitPrice, 250);
  assert.equal(result.changed, true);
});

test('корзина полностью удаляет остановленную позицию', () => {
  const line = createCartLine({
    productId: 'nuggets',
    name: 'Наггетсы',
    unitPrice: 200,
  });
  const result = reconcileKioskCart([line], {
    ...available,
    stoppedProductIds: ['nuggets'],
  });

  assert.deepEqual(result.lines, []);
  assert.deepEqual(result.removedLineIds, [line.lineId]);
});
