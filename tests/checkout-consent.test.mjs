import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getCheckoutFieldOrder,
  validateCheckout,
} from '../checkout-state.js';
import * as checkout from '../checkout.js';
import {
  loadActiveOrder,
  saveActiveOrder,
} from '../order-storage.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const createMemoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const getCssBlock = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing CSS block: ${selector}`);
  const bodyStart = css.indexOf('{', start) + 1;
  const bodyEnd = css.indexOf('}', bodyStart);
  return css.slice(bodyStart, bodyEnd);
};

const getHexProperty = (block, property) => {
  const value = block.match(
    new RegExp(`${property}\\s*:\\s*(#[0-9a-f]{6})`, 'i'),
  )?.[1];
  assert.ok(value, `Missing six-digit hex value for ${property}`);
  return value;
};

const relativeLuminance = (hex) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );
  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
};

const contrastRatio = (first, second) => {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
};

const CHECKOUT_ATTEMPT_STORAGE_KEY = 'pivnoy-doner-checkout-attempt-v1';
const LEGACY_DELIVERY_ADDRESS_STORAGE_KEY =
  'pivnoy-doner-delivery-address-v1';

test('оформление называет недоступные товары и не меняет корзину', () => {
  const lines = [
    { productId: 'nuggets', name: 'Наггетсы', quantity: 1 },
    { productId: 'sauce-tasty', name: 'Тейсти', quantity: 2 },
  ];
  const unavailable = checkout.getUnavailableCheckoutProducts(lines, {
    stoppedProductIds: ['nuggets'],
  });

  assert.deepEqual(unavailable, [
    { productId: 'nuggets', name: 'Наггетсы' },
  ]);
  assert.equal(
    checkout.getUnavailableCheckoutMessage(unavailable),
    'Сейчас нет в наличии: Наггетсы. Удалите товар или выберите другой.',
  );
  assert.equal(lines.length, 2);
});

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

test('retry marker stores only an opaque SHA-256 digest, key and timestamp', async () => {
  const storage = createMemoryStorage();
  const payload = checkout.createCheckoutOrderPayload({
    lines: [{ productId: 'private-product', quantity: 1 }],
    fulfillment: 'delivery',
    customerName: 'PRIVATE-CUSTOMER-NAME',
    phone: '+7 (999) 123-45-67 PRIVATE-PHONE',
    address: {
      street: 'PRIVATE-STREET',
      apartment: 'PRIVATE-APARTMENT',
    },
    courierComment: 'PRIVATE-COURIER-COMMENT',
    personalDataConsent: true,
  });

  const key = await checkout.getCheckoutAttemptKey(storage, payload, {
    randomUUID: () => 'same-order',
    now: () => 1_786_400_000_000,
  });
  const serializedRetryState = storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
  const marker = JSON.parse(serializedRetryState);

  assert.equal(key, 'checkout-same-order');
  assert.deepEqual(Object.keys(marker).sort(), ['createdAt', 'digest', 'key']);
  assert.match(marker.digest, /^[0-9a-f]{64}$/);
  assert.equal(marker.key, key);
  assert.equal(marker.createdAt, 1_786_400_000_000);
  for (const privateValue of [
    'PRIVATE-CUSTOMER-NAME',
    'PRIVATE-PHONE',
    'PRIVATE-STREET',
    'PRIVATE-APARTMENT',
    'PRIVATE-COURIER-COMMENT',
  ]) {
    assert.doesNotMatch(serializedRetryState, new RegExp(privateValue));
  }
  assert.doesNotMatch(serializedRetryState, /personalDataConsent/);
  assert.doesNotMatch(serializedRetryState, /offerVersion/);
  assert.doesNotMatch(serializedRetryState, /2026-08-11/);
});

test('retry key is stable across legal-only payload differences', async () => {
  const storage = createMemoryStorage();
  const payload = checkout.createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    phone: '+7 (999) 123-45-67',
    personalDataConsent: true,
  });
  const firstKey = await checkout.getCheckoutAttemptKey(storage, payload, {
    randomUUID: () => 'first-key',
  });

  const retryKey = await checkout.getCheckoutAttemptKey(
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

test('retry key changes when the order identity changes', async () => {
  const payload = checkout.createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    fulfillment: 'delivery',
    customerName: 'Иван',
    phone: '+7 (999) 123-45-67',
    address: { street: 'Улица 1' },
    courierComment: 'Первый комментарий',
    personalDataConsent: true,
  });
  const storage = createMemoryStorage();
  let keyNumber = 0;
  const options = { randomUUID: () => `key-${++keyNumber}` };
  const firstKey = await checkout.getCheckoutAttemptKey(
    storage,
    payload,
    options,
  );
  const sameKey = await checkout.getCheckoutAttemptKey(
    storage,
    {
      offerVersion: payload.offerVersion,
      items: payload.items,
      courierComment: payload.courierComment,
      address: payload.address,
      customer: payload.customer,
      fulfillment: payload.fulfillment,
      personalDataConsentVersion: payload.personalDataConsentVersion,
      personalDataConsent: payload.personalDataConsent,
    },
    options,
  );
  assert.equal(sameKey, firstKey);

  const changedPayloads = [
    { ...payload, customer: { ...payload.customer, name: 'Пётр' } },
    { ...payload, customer: { ...payload.customer, phone: '+7 999 000-00-00' } },
    { ...payload, address: { street: 'Улица 2' } },
    { ...payload, courierComment: 'Другой комментарий' },
    {
      ...payload,
      items: [{ ...payload.items[0], quantity: 2 }],
    },
  ];
  for (const [index, changedPayload] of changedPayloads.entries()) {
    const isolatedStorage = createMemoryStorage();
    const originalKey = await checkout.getCheckoutAttemptKey(
      isolatedStorage,
      payload,
      { randomUUID: () => `original-${index}` },
    );
    const changedKey = await checkout.getCheckoutAttemptKey(
      isolatedStorage,
      changedPayload,
      { randomUUID: () => `changed-${index}` },
    );
    assert.notEqual(changedKey, originalKey);
  }
});

test('legacy raw retry marker is migrated without changing its key', async () => {
  const payload = checkout.createCheckoutOrderPayload({
    lines: [{ productId: 'nuggets', quantity: 1 }],
    fulfillment: 'delivery',
    customerName: 'LEGACY-PRIVATE-NAME',
    phone: 'LEGACY-PRIVATE-PHONE',
    address: { street: 'LEGACY-PRIVATE-STREET' },
    courierComment: 'LEGACY-PRIVATE-COMMENT',
    personalDataConsent: true,
  });
  const {
    personalDataConsent: _personalDataConsent,
    personalDataConsentVersion: _personalDataConsentVersion,
    offerVersion: _offerVersion,
    ...legacyIdentity
  } = payload;
  const storage = createMemoryStorage({
    [CHECKOUT_ATTEMPT_STORAGE_KEY]: JSON.stringify({
      fingerprint: JSON.stringify(legacyIdentity),
      key: 'checkout-legacy-key',
    }),
  });

  const key = await checkout.getCheckoutAttemptKey(storage, payload, {
    randomUUID: () => 'unexpected-new-key',
    now: () => 1_786_400_000_001,
  });
  const migrated = storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);

  assert.equal(key, 'checkout-legacy-key');
  assert.deepEqual(Object.keys(JSON.parse(migrated)).sort(), [
    'createdAt',
    'digest',
    'key',
  ]);
  assert.doesNotMatch(migrated, /LEGACY-PRIVATE/);
});

test('retry marker fails closed when Web Crypto SHA-256 is unavailable', async () => {
  const storage = createMemoryStorage();
  const payload = checkout.createCheckoutOrderPayload({
    phone: 'PRIVATE-PHONE',
    personalDataConsent: true,
  });

  await assert.rejects(
    checkout.getCheckoutAttemptKey(storage, payload, { cryptoRef: {} }),
    /SHA-256/i,
  );
  assert.equal(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY), null);
});

test('unavailable Web Crypto purges a legacy raw retry marker', async () => {
  const storage = createMemoryStorage({
    [CHECKOUT_ATTEMPT_STORAGE_KEY]: JSON.stringify({
      fingerprint: 'PRIVATE-LEGACY-FINGERPRINT',
      key: 'checkout-legacy',
    }),
  });

  await assert.rejects(
    checkout.getCheckoutAttemptKey(
      storage,
      { customer: { phone: 'PRIVATE-PHONE' } },
      { cryptoRef: {} },
    ),
    /SHA-256/i,
  );
  assert.equal(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY), null);
});

test('checkout clears a legacy stored delivery address and keeps no save path', async () => {
  const storage = createMemoryStorage({
    [LEGACY_DELIVERY_ADDRESS_STORAGE_KEY]: JSON.stringify({
      street: 'PRIVATE-STREET',
    }),
  });

  checkout.clearLegacyDeliveryAddress(storage);

  assert.equal(storage.getItem(LEGACY_DELIVERY_ADDRESS_STORAGE_KEY), null);
  assert.doesNotMatch(await read('checkout.js'), /saveDeliveryAddress/);
});

test('demo active-order storage strips checkout personal data and migrates legacy data', () => {
  const storage = createMemoryStorage();
  const privateOrder = {
    id: 'local-private-order',
    number: '1234',
    createdAt: '2026-08-11T12:00:00.000Z',
    status: 'submitted',
    fulfillment: 'delivery',
    customerName: 'PRIVATE-CUSTOMER',
    phone: 'PRIVATE-PHONE',
    address: { street: 'PRIVATE-STREET', apartment: 'PRIVATE-APARTMENT' },
    comment: 'PRIVATE-COURIER-COMMENT',
    items: [
      {
        productId: 'nuggets',
        name: 'Наггетсы',
        quantity: 1,
        unitPrice: 300,
        comment: 'PRIVATE-ITEM-COMMENT',
      },
    ],
    itemsTotal: 300,
    total: 500,
  };

  saveActiveOrder(storage, privateOrder);
  const saved = storage.getItem('pivnoy-doner-active-order-v1');
  for (const privateValue of [
    'PRIVATE-CUSTOMER',
    'PRIVATE-PHONE',
    'PRIVATE-STREET',
    'PRIVATE-APARTMENT',
    'PRIVATE-COURIER-COMMENT',
    'PRIVATE-ITEM-COMMENT',
  ]) {
    assert.doesNotMatch(saved, new RegExp(privateValue));
  }

  storage.setItem('pivnoy-doner-active-order-v1', JSON.stringify(privateOrder));
  const migrated = loadActiveOrder(storage);
  const migratedStorage = storage.getItem('pivnoy-doner-active-order-v1');
  assert.equal(migrated.customerName, '');
  assert.equal(migrated.phone, '');
  assert.equal(migrated.address.street, '');
  assert.equal(migrated.comment, '');
  assert.equal(migrated.items[0].comment, '');
  assert.doesNotMatch(migratedStorage, /PRIVATE-/);
});

test('legacy active-order migration still returns safe data when storage writes are blocked', () => {
  const legacyOrder = {
    id: 'local-private-order',
    number: '1234',
    createdAt: '2026-08-11T12:00:00.000Z',
    fulfillment: 'delivery',
    customerName: 'PRIVATE-CUSTOMER',
    phone: 'PRIVATE-PHONE',
    address: { street: 'PRIVATE-STREET' },
    comment: 'PRIVATE-COMMENT',
    items: [{ productId: 'nuggets', quantity: 1 }],
  };
  const storage = {
    getItem: () => JSON.stringify(legacyOrder),
    setItem: () => {
      throw new Error('storage-write-blocked');
    },
  };

  const loaded = loadActiveOrder(storage);

  assert.equal(loaded.id, legacyOrder.id);
  assert.equal(loaded.customerName, '');
  assert.equal(loaded.phone, '');
  assert.equal(loaded.address.street, '');
  assert.equal(loaded.comment, '');
});

test('required consent and its theme tokens meet accessibility contrast', async () => {
  const html = await read('checkout.html');
  const css = await read('client-theme.css');
  const checkbox = html.match(
    /<input\b(?=[^>]*\bdata-personal-data-consent\b)[^>]*>/i,
  )?.[0];
  const form = html.match(
    /<form\b(?=[^>]*\bdata-checkout-form\b)[^>]*>/i,
  )?.[0];

  assert.ok(checkbox, 'Missing personal-data consent checkbox');
  assert.ok(form, 'Missing checkout form');
  assert.match(form, /\snovalidate(?:\s|=|\/?>)/i);
  assert.match(checkbox, /\srequired(?:\s|=|\/?>)/i);
  assert.match(checkbox, /\saria-required=["']true["']/i);
  assert.doesNotMatch(checkbox, /\schecked(?:\s|=|\/?>)/i);
  assert.match(
    css,
    /\.checkout-consent input:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--checkout-focus-ring\)/s,
  );
  assert.match(
    css,
    /\.checkout-legal \.field-error\s*\{[^}]*color:\s*var\(--checkout-error-text\)/s,
  );

  const light = getCssBlock(css, ':root');
  const dark = getCssBlock(css, "html[data-theme='dark']");
  for (const [theme, block] of [
    ['light', light],
    ['dark', dark],
  ]) {
    const focus = getHexProperty(block, '--checkout-focus-ring');
    const errorText = getHexProperty(block, '--checkout-error-text');
    const surface = getHexProperty(block, '--client-surface');
    const errorSurface = getHexProperty(block, '--checkout-error-surface');
    assert.ok(
      contrastRatio(focus, surface) >= 3,
      `${theme} focus contrast is below 3:1`,
    );
    assert.ok(
      contrastRatio(focus, errorSurface) >= 3,
      `${theme} focus contrast on the error surface is below 3:1`,
    );
    assert.ok(
      contrastRatio(errorText, errorSurface) >= 4.5,
      `${theme} error text contrast is below 4.5:1`,
    );
  }
});

test('unchecked consent overrides every other checkout focus error', () => {
  const errors = validateCheckout({
    fulfillment: 'delivery',
    phone: '',
    address: { street: '' },
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

test('checked consent preserves normal checkout focus order', () => {
  const errors = validateCheckout({
    fulfillment: 'delivery',
    phone: '',
    address: { street: '' },
    itemsTotal: 250,
    personalDataConsent: true,
  });

  assert.deepEqual(
    checkout.getCheckoutValidationAction(
      errors,
      getCheckoutFieldOrder('delivery'),
    ),
    {
      focusField: 'address',
      toast: 'Добавьте блюда ещё на 50 ₽',
    },
  );
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
