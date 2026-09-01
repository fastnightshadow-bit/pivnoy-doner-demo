import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './helpers.mjs';

const RELEASE = '2026090101';

const expectVersioned = (source, asset) => {
  assert.match(source, new RegExp(`${asset.replace('.', '\\\.')}\\?v=${RELEASE}`));
};

test('новое меню получает отдельную immutable-версию во всех клиентских приложениях', () => {
  const homeHtml = readText('home.html');
  const cartHtml = readText('cart.html');
  const dishHtml = readText('dish.html');
  const checkoutHtml = readText('checkout.html');
  const kioskHtml = readText('kiosk.html');
  const kitchenHtml = readText('kitchen.html');
  const ownerHtml = readText('owner.html');

  expectVersioned(homeHtml, 'home.js');
  expectVersioned(cartHtml, 'cart.js');
  expectVersioned(dishHtml, 'dish.js');
  expectVersioned(checkoutHtml, 'checkout.js');
  expectVersioned(kioskHtml, 'kiosk-app.js');
  expectVersioned(kioskHtml, 'kiosk-session-runtime.js');
  expectVersioned(kioskHtml, 'kiosk-catalog.css');
  expectVersioned(kitchenHtml, 'kitchen.js');
  expectVersioned(ownerHtml, 'owner.js');
});

test('точки входа и общие модули не возвращают старый каталог из immutable-кэша', () => {
  const expectedImports = new Map([
    ['home.js', ['catalog-data.js', 'home-menu.js', 'product-config.js', 'product-sheet.js', 'cart-storage.js']],
    ['home-menu.js', ['catalog-data.js', 'product-config.js']],
    ['product-sheet.js', ['catalog-data.js', 'product-config.js', 'cart-storage.js']],
    ['cart.js', ['catalog-data.js', 'product-config.js', 'cart-storage.js']],
    ['cart-storage.js', ['cart-security.js']],
    ['cart-security.js', ['catalog-data.js', 'product-config.js']],
    ['checkout.js', ['product-config.js', 'cart-security.js', 'cart-storage.js']],
    ['dish.js', ['catalog-data.js', 'product-config.js', 'cart-storage.js']],
    ['kiosk-app.js', ['catalog-data.js', 'product-config.js', 'kiosk-api.js', 'kiosk-availability.js', 'kiosk-cart-presentation.js', 'kiosk-presentation.js']],
    ['kiosk-api.js', ['kiosk-fixtures.js']],
    ['kiosk-fixtures.js', ['catalog-data.js']],
    ['kiosk-availability.js', ['catalog-data.js', 'product-config.js']],
    ['kiosk-cart-presentation.js', ['catalog-data.js', 'product-config.js', 'kiosk-availability.js']],
    ['kiosk-presentation.js', ['catalog-data.js', 'product-config.js', 'kiosk-availability.js']],
    ['kitchen.js', ['catalog-data.js', 'kitchen-api.js', 'owner-menu.js', 'kitchen-menu.js']],
    ['kitchen-api.js', ['catalog-data.js', 'product-config.js']],
    ['kitchen-menu.js', ['product-config.js', 'owner-menu.js']],
    ['owner.js', ['catalog-data.js', 'product-config.js', 'owner-menu.js']],
    ['owner-menu.js', ['catalog-data.js', 'product-config.js']],
    ['product-config.js', ['catalog-data.js']],
  ]);

  for (const [file, assets] of expectedImports) {
    const source = readText(file);
    for (const asset of assets) expectVersioned(source, asset);
  }
});

test('PWA киоска и кухни принудительно обновляют оболочку релиза меню', () => {
  const kioskWorker = readText('kiosk-sw.js');
  const kioskRuntime = readText('kiosk-session-runtime.js');
  const kitchenWorker = readText('kitchen-sw.js');
  const kitchenSource = readText('kitchen.js');

  assert.match(kioskWorker, new RegExp(`const VERSION = '${RELEASE}'`));
  assert.match(kioskRuntime, new RegExp(`const KIOSK_BUILD = '${RELEASE}'`));
  assert.match(kioskWorker, /fetch\(event\.request, \{ cache: 'no-cache' \}\)/);
  assert.match(kitchenWorker, /pivnoy-doner-kitchen-shell-v16/);
  assert.match(kitchenWorker, /fetch\(event\.request, \{ cache: 'no-cache' \}\)/);
  expectVersioned(kitchenSource, 'kitchen-sw.js');
});
