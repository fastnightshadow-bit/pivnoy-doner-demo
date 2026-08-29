import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KIOSK_SCREENS,
  createKioskState,
  reduceKioskState,
  resetKioskState,
} from '../kiosk-state.js';

test('публичный сценарий проходит только по разрешённым экранам', () => {
  let state = createKioskState();
  state = reduceKioskState(state, { type: 'START' });
  assert.equal(state.screen, 'fulfillment');

  state = reduceKioskState(state, {
    type: 'SET_FULFILLMENT',
    value: 'dine-in',
  });
  assert.equal(state.screen, 'catalog');

  state = reduceKioskState(state, { type: 'OPEN_CART' });
  assert.equal(state.screen, 'cart');

  state = reduceKioskState(state, { type: 'OPEN_PAYMENT_METHOD' });
  assert.equal(state.screen, 'payment-method');

  state = reduceKioskState(state, { type: 'SELECT_PAYMENT', value: 'qr' });
  assert.equal(state.screen, 'qr-payment');
});

test('нелогичный переход не меняет состояние', () => {
  const state = createKioskState();
  const result = reduceKioskState(state, {
    type: 'SELECT_PAYMENT',
    value: 'card',
  });

  assert.equal(result, state);
  assert.equal(KIOSK_SCREENS.includes(result.screen), true);
});

test('полный сброс не оставляет данные предыдущего посетителя', () => {
  const dirty = {
    ...createKioskState(),
    screen: 'success',
    fulfillment: 'takeaway',
    lines: [{ lineId: 'x', quantity: 2 }],
    order: { id: 'order-1', number: '24' },
    payment: { id: 'payment-1', status: 'succeeded' },
  };

  assert.deepEqual(
    reduceKioskState(dirty, { type: 'RESET' }),
    resetKioskState(),
  );
});

test('успешная оплата сохраняет заказ и открывает отдельный экран успеха', () => {
  let state = {
    ...createKioskState(),
    screen: 'card-payment',
    fulfillment: 'takeaway',
    lines: [{ lineId: 'x', quantity: 1 }],
    order: { id: 'order-7', number: '31' },
  };

  state = reduceKioskState(state, {
    type: 'PAYMENT_SUCCEEDED',
    payment: { id: 'payment-7', status: 'succeeded' },
  });

  assert.equal(state.screen, 'success');
  assert.equal(state.order.number, '31');
  assert.equal(state.payment.status, 'succeeded');
});

test('карточка, открытая из корзины, закрывается обратно в корзину', () => {
  let state = {
    ...createKioskState(),
    screen: 'cart',
    fulfillment: 'dine-in',
    lines: [{ lineId: 'line-1', productId: 'classic-shawarma', quantity: 1 }],
  };

  state = reduceKioskState(state, {
    type: 'OPEN_PRODUCT',
    productId: 'classic-shawarma',
  });
  assert.equal(state.screen, 'product');
  assert.equal(state.productReturnScreen, 'cart');

  state = reduceKioskState(state, { type: 'CLOSE_PRODUCT' });
  assert.equal(state.screen, 'cart');
});
