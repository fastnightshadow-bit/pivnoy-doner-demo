import test from 'node:test';
import assert from 'node:assert/strict';

import { extractJson, readText } from './helpers.mjs';

test('киоск не блокирует горизонтальный планшет и поддерживает обе ориентации', () => {
  const baseCss = readText('kiosk.css');
  const manifest = extractJson('kiosk.webmanifest');

  assert.equal(manifest.orientation, 'any');
  assert.match(baseCss, /@media\s*\(orientation:\s*landscape\)/);
  assert.doesNotMatch(baseCss, /\.kiosk-app\s*\{\s*display:\s*none/);
  assert.match(baseCss, /\.kiosk-start\s*\{[^}]*grid-template-columns:/s);
});

test('каталог и карточка товара используют компактную планшетную геометрию', () => {
  const catalogCss = readText('kiosk-catalog.css');
  const fixesCss = readText('kiosk-fixes-v3.css');

  assert.match(catalogCss, /\.kiosk-option-quantity\s*\{/);
  assert.match(fixesCss, /height:\s*min\(98dvh,\s*1100px\)/);
  assert.match(fixesCss, /@media\s*\(orientation:\s*landscape\)/);
  assert.match(fixesCss, /\.kiosk-product-sheet\s*\{[^}]*width:\s*min\(720px,\s*72vw\)/s);
});

test('низкий планшет получает отдельную компактную раскладку оплаты и корзины', () => {
  const cartCss = readText('kiosk-cart.css');
  const paymentCss = readText('kiosk-payment.css');
  const sessionCss = readText('kiosk-session.css');

  assert.match(cartCss, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*760px\)/);
  assert.match(paymentCss, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*760px\)/);
  assert.match(sessionCss, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*760px\)/);
});
