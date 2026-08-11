import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCheckoutFieldOrder,
  validateCheckout,
} from '../checkout-state.js';
import { createCheckoutOrderPayload } from '../checkout.js';

test('checkout rejects an unchecked personal-data consent', () => {
  const errors = validateCheckout({
    fulfillment: 'pickup',
    phone: '+7 (999) 123-45-67',
    itemsTotal: 700,
    personalDataConsent: false,
  });

  assert.equal(
    errors.personalDataConsent,
    'Подтвердите согласие на обработку данных',
  );
});

test('order payload contains current legal versions', () => {
  const payload = createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    phone: '+7 (999) 123-45-67',
    personalDataConsent: true,
  });

  assert.equal(payload.personalDataConsent, true);
  assert.equal(payload.personalDataConsentVersion, '2026-08-11');
  assert.equal(payload.offerVersion, '2026-08-11');
});

test('checkout focuses personal-data consent after the other required fields', () => {
  assert.deepEqual(getCheckoutFieldOrder('pickup'), [
    'phone',
    'personalDataConsent',
  ]);
  assert.deepEqual(getCheckoutFieldOrder('delivery', 'scheduled'), [
    'address',
    'phone',
    'selectedTime',
    'personalDataConsent',
  ]);
});
