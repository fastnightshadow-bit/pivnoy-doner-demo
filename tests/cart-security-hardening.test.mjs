import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCanonicalCheckoutItems,
  sanitizeCartLines,
} from '../cart-security.js';

test('поддельные товары удаляются, а цена известного товара восстанавливается из каталога', () => {
  const lines = sanitizeCartLines([
    {
      productId: 'fake-free-product',
      name: 'Бесплатно',
      unitPrice: 0.01,
      quantity: 999,
    },
    {
      productId: 'classic-shawarma',
      name: '<img src=x onerror=alert(1)>',
      unitPrice: 1,
      meat: 'Курица',
      size: 'Стандарт · 350 г',
      addons: { Халапеньо: 2 },
      sauces: { Неизвестный: 5 },
      quantity: 1,
      image: 'javascript:alert(1)',
    },
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].productId, 'classic-shawarma');
  assert.equal(lines[0].name, 'Классическая шаурма');
  assert.equal(lines[0].unitPrice, 400);
  assert.equal(lines[0].image, 'assets/catalog/classic-shawarma.webp');
  assert.deepEqual(lines[0].addons, { Халапеньо: 2 });
  assert.deepEqual(lines[0].sauces, {});
});

test('корзина ограничивает количество одной позиции и общий объём заказа', () => {
  const lines = sanitizeCartLines([
    {
      productId: 'classic-shawarma',
      meat: 'Курица',
      size: 'Стандарт · 350 г',
      quantity: 999,
    },
    {
      productId: 'tasty-shawarma',
      meat: 'Курица',
      size: 'Стандарт · 350 г',
      quantity: 999,
    },
    {
      productId: 'curry-shawarma',
      meat: 'Курица',
      size: 'Стандарт · 350 г',
      quantity: 999,
    },
  ]);

  assert.deepEqual(lines.map(({ quantity }) => quantity), [20, 20, 10]);
});

test('checkout получает только идентификаторы каталога без цены и названия', () => {
  const items = createCanonicalCheckoutItems([
    {
      productId: 'classic-shawarma',
      name: 'Подмена',
      unitPrice: 1,
      meat: 'Говядина',
      size: 'Гигант · 650 г',
      addons: { 'Жареный лук': 2 },
      quantity: 2,
    },
  ]);

  assert.deepEqual(items, [
    {
      productId: 'classic-shawarma',
      quantity: 2,
      meat: 'beef',
      size: 'giant',
      addons: { onion: 2 },
      sauces: {},
    },
  ]);
  assert.equal('name' in items[0], false);
  assert.equal('unitPrice' in items[0], false);
});
