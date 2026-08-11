import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELIVERY_CLOSE_MINUTES,
  DELIVERY_FEE,
  DELIVERY_FREE_FROM,
  DELIVERY_MINIMUM,
  DELIVERY_OPEN_MINUTES,
  getDeliveryFee,
  getDeliveryMinimumRemaining,
  isDeliveryOpen,
} from '../delivery-policy.js';
import { createCheckoutSummary, validateCheckout } from '../checkout-state.js';

const line = (items) => ({ unitPrice: items, quantity: 1 });

test('правила доставки совпадают с условиями ресторана', () => {
  assert.equal(DELIVERY_MINIMUM, 300);
  assert.equal(DELIVERY_FEE, 200);
  assert.equal(DELIVERY_FREE_FROM, 2000);
  assert.equal(DELIVERY_OPEN_MINUTES, 11 * 60 + 30);
  assert.equal(DELIVERY_CLOSE_MINUTES, 22 * 60 + 30);
});

test('доставка стоит 200 рублей и становится бесплатной от 2000', () => {
  assert.equal(getDeliveryFee(1999, 'delivery'), 200);
  assert.equal(getDeliveryFee(2000, 'delivery'), 0);
  assert.equal(getDeliveryFee(500, 'pickup'), 0);
});

test('минимальная сумма считается только для доставки', () => {
  assert.equal(getDeliveryMinimumRemaining(250, 'delivery'), 50);
  assert.equal(getDeliveryMinimumRemaining(300, 'delivery'), 0);
  assert.equal(getDeliveryMinimumRemaining(0, 'pickup'), 0);
});

test('итог checkout учитывает доставку и скидку', () => {
  assert.deepEqual(createCheckoutSummary([line(1000)], '', 'delivery'), {
    items: 1000,
    delivery: 200,
    discount: 0,
    total: 1200,
  });
});

test('валидация не пропускает доставку дешевле 300 рублей', () => {
  const errors = validateCheckout({
    fulfillment: 'delivery',
    itemsTotal: 250,
    phone: '+7 (999) 111-22-33',
    address: { street: 'Тестовая улица, 1' },
    personalDataConsent: true,
  });
  assert.equal(errors.order, 'Добавьте блюда ещё на 50 ₽');
});

test('окно доставки открыто с 11:30 до 22:30 включительно', () => {
  assert.equal(isDeliveryOpen(new Date(2026, 7, 5, 11, 29)), false);
  assert.equal(isDeliveryOpen(new Date(2026, 7, 5, 11, 30)), true);
  assert.equal(isDeliveryOpen(new Date(2026, 7, 5, 22, 30)), true);
  assert.equal(isDeliveryOpen(new Date(2026, 7, 5, 22, 31)), false);
});
