import test from 'node:test';
import assert from 'node:assert/strict';

import { createCartLine } from '../cart-state.js';
import { createKioskState } from '../kiosk-state.js';
import { renderKioskCart } from '../kiosk-cart-presentation.js';

const context = { settings: { acceptingOrders: true, stoppedProductIds: [], stoppedMeatIds: [], stoppedSauceIds: [], stoppedAddonIds: [] }, connected: true };

test('корзина показывает состав, количество и итог', () => {
  const line = createCartLine({ productId: 'classic-shawarma', name: 'Классическая шаурма', unitPrice: 400, meat: 'chicken', size: 'standard', addons: { cheese: 1 }, quantity: 2, image: 'assets/catalog/classic-shawarma.webp' });
  const state = { ...createKioskState(), screen: 'cart', fulfillment: 'dine-in', lines: [line] };
  const markup = renderKioskCart(state, context);
  assert.match(markup, /Классическая шаурма/);
  assert.match(markup, /Курица/);
  assert.match(markup, /Сыр/);
  assert.match(markup, /data-kiosk-line-quantity/);
  assert.match(markup, new RegExp(`data-kiosk-edit-line="${line.lineId}"`));
  assert.match(markup, /800\s*₽/);
  assert.match(markup, /Перейти к оплате/);
  assert.match(markup, /data-delta="1"[^>]*>[\s\S]*?kiosk-plus-glyph/);
});

test('пустая корзина не позволяет перейти к оплате', () => {
  const state = { ...createKioskState(), screen: 'cart', fulfillment: 'takeaway' };
  const markup = renderKioskCart(state, context);
  assert.match(markup, /Корзина пока пуста/);
  assert.match(markup, /class="kiosk-cart-empty__icon"/);
  assert.match(markup, /data-kiosk-checkout[^>]*disabled/);
});

test('быстрое добавление в рекомендациях использует центрированный значок плюса', () => {
  const state = { ...createKioskState(), screen: 'cart', fulfillment: 'takeaway' };
  const markup = renderKioskCart(state, context);
  assert.match(markup, /class="kiosk-cart-rec[^"]*"[\s\S]*?class="kiosk-plus-glyph"/);
});
