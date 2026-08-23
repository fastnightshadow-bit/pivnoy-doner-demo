import test from 'node:test';
import assert from 'node:assert/strict';

import { createKioskState } from '../kiosk-state.js';
import { renderKioskPayment } from '../kiosk-payment-presentation.js';

const base = { ...createKioskState(), fulfillment: 'dine-in', lines: [{ unitPrice: 490, quantity: 1 }] };

test('выбор оплаты занимает отдельный экран и предлагает карту и QR', () => {
  const markup = renderKioskPayment({ ...base, screen: 'payment-method' });
  assert.match(markup, /Выберите способ оплаты/);
  assert.match(markup, /data-kiosk-payment="card"/);
  assert.match(markup, /data-kiosk-payment="qr"/);
  assert.match(markup, /490\s*₽/);
});

test('экран карты показывает понятную инструкцию', () => {
  const markup = renderKioskPayment({ ...base, screen: 'card-payment' }, { paymentPending: true });
  assert.match(markup, /Приложите карту/);
  assert.match(markup, /Терминал ожидает оплату/);
});

test('экран QR показывает код и инструкцию', () => {
  const markup = renderKioskPayment({ ...base, screen: 'qr-payment' }, { paymentPending: true, qrValue: 'demo' });
  assert.match(markup, /Наведите камеру/);
  assert.match(markup, /data-kiosk-qr/);
});

test('успех показывает номер заказа, а ошибка позволяет повторить', () => {
  const success = renderKioskPayment({ ...base, screen: 'success', order: { number: '24' } });
  assert.match(success, /Заказ принят/);
  assert.match(success, /№ 24/);
  const failure = renderKioskPayment({ ...base, screen: 'error', error: 'Оплата не прошла' });
  assert.match(failure, /Оплата не прошла/);
  assert.match(failure, /data-kiosk-payment-retry/);
});
