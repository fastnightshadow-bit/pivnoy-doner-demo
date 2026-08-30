import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductionKitchenOrder } from '../kitchen-api.js';
import { normalizeKitchenOrder } from '../kitchen-model.js';
import { createOrderCardMarkup, createOrderDetailsMarkup } from '../kitchen.js';

const rawKioskOrder = {
  id: 'kiosk-order-1',
  number: '31',
  status: 'submitted',
  paymentStatus: 'paid',
  fulfillment: 'pickup',
  source: 'kiosk',
  serviceMode: 'dine_in',
  customerName: '',
  phone: '',
  createdAt: '2026-08-30T12:00:00.000Z',
  eta: { min: 8, max: 12 },
  items: [{ id: 'line-1', name: 'Наггетсы', quantity: 1 }],
  total: 200,
};

test('кухня сохраняет источник и режим обслуживания заказа киоска', () => {
  const production = normalizeProductionKitchenOrder(rawKioskOrder);
  const order = normalizeKitchenOrder(production, Date.parse('2026-08-30T12:01:00.000Z'));
  assert.equal(order.source, 'kiosk');
  assert.equal(order.serviceMode, 'dine_in');
  assert.equal(order.customer.phone, '');
});

test('карточка и детали явно показывают «Киоск · Здесь»', () => {
  const order = normalizeKitchenOrder(
    normalizeProductionKitchenOrder(rawKioskOrder),
    Date.parse('2026-08-30T12:01:00.000Z'),
  );
  const card = createOrderCardMarkup(order);
  const details = createOrderDetailsMarkup(order);
  assert.match(card, /Киоск · Здесь/);
  assert.match(card, /Заказ с киоска/);
  assert.match(details, /Киоск · Здесь/);
  assert.doesNotMatch(details, /href="tel:/);
});

test('режим «с собой» отображается отдельно от обычного самовывоза', () => {
  const order = normalizeKitchenOrder(
    normalizeProductionKitchenOrder({ ...rawKioskOrder, serviceMode: 'takeaway' }),
    Date.parse('2026-08-30T12:01:00.000Z'),
  );
  assert.match(createOrderCardMarkup(order), /Киоск · С собой/);
});
