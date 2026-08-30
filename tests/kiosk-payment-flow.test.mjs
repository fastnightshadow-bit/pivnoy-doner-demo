import test from 'node:test';
import assert from 'node:assert/strict';
import { createKioskPaymentController } from '../kiosk-payment-flow.js';

test('карточная кнопка показывает только анимацию и не создаёт заказ', () => {
  let createCalls = 0;
  let scheduled;
  const states = [];
  const controller = createKioskPaymentController({
    api: { createOrder: async () => { createCalls += 1; } },
    setTimeoutImpl: (callback, delay) => {
      scheduled = { callback, delay };
      return 1;
    },
  });

  controller.showCardAnimation((state) => states.push(state));
  assert.equal(createCalls, 0);
  assert.deepEqual(states, ['waiting']);
  assert.equal(scheduled.delay, 1800);
  scheduled.callback();
  assert.deepEqual(states, ['waiting', 'unavailable']);
  assert.equal(createCalls, 0);
});

test('QR создаёт заказ и отдельно проверяет статус оплаты', async () => {
  const calls = [];
  const controller = createKioskPaymentController({
    api: {
      createOrder: async (payload, key) => {
        calls.push({ type: 'create', payload, key });
        return { order: { id: 'order-1' }, payment: { status: 'pending' }, qrSvg: '<svg />' };
      },
      getPaymentStatus: async (orderId) => {
        calls.push({ type: 'status', orderId });
        return { payment: { orderId, status: 'paid' } };
      },
    },
  });

  const created = await controller.createQrOrder({ items: [] }, 'operation-1');
  const checked = await controller.getPaymentStatus(created.order.id);
  assert.equal(checked.payment.status, 'paid');
  assert.deepEqual(calls.map(({ type }) => type), ['create', 'status']);
});
