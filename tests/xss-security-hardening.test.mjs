import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartLineMarkup } from '../cart.js';
import { createOrderDetailsMarkup } from '../kitchen.js';
import { createReviewCardMarkup } from '../review-view.js';

const attack = '<img src=x onerror="globalThis.pwned=1"><script>alert(1)</script>';

test('корзина экранирует пользовательский текст', () => {
  const markup = createCartLineMarkup({
    lineId: attack,
    productId: 'classic-shawarma',
    name: attack,
    quantity: 1,
    unitPrice: 300,
    comment: attack,
  });

  assert.doesNotMatch(markup, /<(?:script|img)\b/i);
  assert.match(markup, /&lt;script&gt;/);
});

test('кухня экранирует имя, адрес и комментарии клиента', () => {
  const markup = createOrderDetailsMarkup({
    id: 'order-1',
    number: '1',
    status: 'new',
    fulfillment: 'delivery',
    createdAt: new Date().toISOString(),
    estimatedReadyAt: new Date().toISOString(),
    total: 300,
    customer: { name: attack, phone: '+79000000000' },
    address: { street: attack },
    comment: attack,
    items: [{ name: 'Шаурма', quantity: 1, comment: attack }],
    history: [],
  });

  assert.doesNotMatch(markup, /<(?:script|img)\b/i);
  assert.match(markup, /&lt;script&gt;/);
});

test('публичные отзывы экранируют имя и текст', () => {
  const markup = createReviewCardMarkup({
    authorName: attack,
    comment: attack,
    rating: 5,
    createdAt: new Date().toISOString(),
  });

  assert.doesNotMatch(markup, /<(?:script|img)\b/i);
  assert.match(markup, /&lt;script&gt;/);
});
