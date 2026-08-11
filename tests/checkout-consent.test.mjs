import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCheckoutFieldOrder,
  validateCheckout,
} from '../checkout-state.js';
import * as checkout from '../checkout.js';

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
  const payload = checkout.createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    phone: '+7 (999) 123-45-67',
    personalDataConsent: true,
  });

  assert.equal(payload.personalDataConsent, true);
  assert.equal(payload.personalDataConsentVersion, '2026-08-11');
  assert.equal(payload.offerVersion, '2026-08-11');
});

test('retry marker excludes personal-data consent and legal versions', () => {
  let serializedRetryState = '';
  const storage = {
    getItem: () => serializedRetryState,
    setItem: (_key, value) => {
      serializedRetryState = value;
    },
  };
  const payload = checkout.createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    phone: '+7 (999) 123-45-67',
    personalDataConsent: true,
  });

  checkout.getCheckoutAttemptKey(storage, payload, {
    randomUUID: () => 'same-order',
  });

  assert.doesNotMatch(serializedRetryState, /personalDataConsent/);
  assert.doesNotMatch(serializedRetryState, /offerVersion/);
  assert.doesNotMatch(serializedRetryState, /2026-08-11/);
});

test('retry key is stable across legal-only payload differences', () => {
  let serializedRetryState = '';
  const storage = {
    getItem: () => serializedRetryState,
    setItem: (_key, value) => {
      serializedRetryState = value;
    },
  };
  const payload = checkout.createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    phone: '+7 (999) 123-45-67',
    personalDataConsent: true,
  });
  const firstKey = checkout.getCheckoutAttemptKey(storage, payload, {
    randomUUID: () => 'first-key',
  });

  const retryKey = checkout.getCheckoutAttemptKey(
    storage,
    {
      ...payload,
      personalDataConsent: false,
      personalDataConsentVersion: 'changed-consent-version',
      offerVersion: 'changed-offer-version',
    },
    { randomUUID: () => 'unexpected-new-key' },
  );

  assert.equal(retryKey, firstKey);
});

test('order minimum toast does not bypass consent focus action', () => {
  const errors = validateCheckout({
    fulfillment: 'delivery',
    phone: '+7 (999) 123-45-67',
    address: { street: 'Тестовая улица, 1' },
    itemsTotal: 250,
    personalDataConsent: false,
  });
  const action = checkout.getCheckoutValidationAction?.(
    errors,
    getCheckoutFieldOrder('delivery'),
  );

  assert.deepEqual(action, {
    focusField: 'personalDataConsent',
    toast: 'Добавьте блюда ещё на 50 ₽',
  });
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
