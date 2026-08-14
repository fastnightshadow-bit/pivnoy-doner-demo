import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCourierOrders,
  formatCourierAddress,
  getCourierAction,
  getCourierReadyLabel,
  normalizeCourierOrder,
  sanitizeCourierPhone,
} from '../courier-state.js';

const baseOrder = {
  id: 'delivery-1',
  number: '0460',
  status: 'cooking',
  paymentStatus: 'succeeded',
  fulfillment: 'delivery',
  createdAt: '2026-08-05T10:00:00.000Z',
  promisedAt: '2026-08-05T10:20:00.000Z',
  version: 4,
  customer: { phone: '+7 (999) 111-22-33' },
  address: {
    street: 'Волоколамское шоссе, 10',
    entrance: '2',
    floor: '4',
    apartment: '18',
    intercom: '18К',
  },
};

test('курьер видит только оплаченные подтвержденные доставки', () => {
  const orders = [
    baseOrder,
    { ...baseOrder, id: 'new', status: 'new' },
    { ...baseOrder, id: 'pickup', fulfillment: 'pickup' },
    { ...baseOrder, id: 'failed', paymentStatus: 'failed' },
  ];
  assert.deepEqual(filterCourierOrders(orders).map(({ id }) => id), [
    'delivery-1',
  ]);
});

test('заказ курьера сохраняет только необходимые данные', () => {
  assert.deepEqual(normalizeCourierOrder(baseOrder), {
    id: 'delivery-1',
    number: '0460',
    status: 'cooking',
    promisedAt: '2026-08-05T10:20:00.000Z',
    version: 4,
    phone: '+7 (999) 111-22-33',
    address: baseOrder.address,
  });
});

test('курьер принимает готовый заказ и завершает доставку сам', () => {
  assert.deepEqual(getCourierAction({ status: 'ready' }), {
    status: 'courier',
    label: 'Принять заказ',
  });
  assert.deepEqual(getCourierAction({ status: 'handed_to_courier' }), {
    status: 'completed',
    label: 'Заказ доставлен',
  });
  assert.equal(getCourierAction({ status: 'cooking' }), null);
});

test('адрес собирается в одну читаемую строку', () => {
  assert.equal(
    formatCourierAddress(baseOrder.address),
    'Волоколамское шоссе, 10 · подъезд 2 · этаж 4 · кв. 18 · домофон 18К',
  );
});

test('телефон превращается в безопасную ссылку tel', () => {
  assert.equal(sanitizeCourierPhone('+7 (999) 111-22-33'), '+79991112233');
  assert.equal(sanitizeCourierPhone('нет телефона'), '');
});

test('готовность считается по времени ресторана', () => {
  assert.equal(
    getCourierReadyLabel(baseOrder, new Date('2026-08-05T10:08:00.000Z')),
    'Будет готов через 12 мин',
  );
  assert.equal(
    getCourierReadyLabel({ ...baseOrder, status: 'ready' }),
    'Можно забирать',
  );
});
