import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readText } from './helpers.mjs';

const requiredPages = [
  'home.html',
  'catalog.html',
  'dish.html',
  'cart.html',
  'checkout.html',
  'order.html',
  'kitchen.html',
  'courier.html',
  'kiosk.html',
];

test('dark theme keeps every unavailable label readable', () => {
  const css = readText('client-theme.css');

  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.menu-product__unavailable,[\s\S]*?\.product-unavailable-badge\s*\{[^}]*color:\s*#171717;[^}]*background:\s*#f7f7f5;/s,
  );
  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.menu-add\.is-unavailable,\s*html\[data-theme='dark'\]\s+\.featured-add\.is-unavailable\s*\{[^}]*color:\s*var\(--client-muted\);[^}]*background:\s*var\(--client-surface-raised\);/s,
  );
  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.product-sheet__unavailable\s*\{[^}]*color:\s*var\(--client-text\);[^}]*background:\s*var\(--client-surface-raised\);/s,
  );
  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.client-footer\s*\{[^}]*background:\s*var\(--client-surface\);/s,
  );
  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.ordering-status\s*\{[^}]*color:\s*var\(--client-text\);/s,
  );
});

test('focused delivery address stays readable in dark theme', () => {
  const css = readText('client-theme.css');

  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.address-details input:focus\s*\{[^}]*color:\s*var\(--client-text\);[^}]*background:\s*var\(--control-surface\);[^}]*border-color:\s*var\(--checkout-focus-ring\);/s,
  );
});

test('iPhone keeps the product comment field at page scale while typing', () => {
  const html = readText('home.html');
  const css = readText('product-sheet.css');
  const textareaRule = css.match(/\.product-sheet__comment textarea\s*\{([^}]*)\}/)?.[1] ?? '';
  const fontSize = Number(textareaRule.match(/font-size:\s*([\d.]+)px/)?.[1]);

  assert.ok(fontSize >= 16, `Expected at least 16px, received ${fontSize || 'no font size'}`);
  assert.doesNotMatch(html, /(?:maximum-scale\s*=\s*1|user-scalable\s*=\s*no)/i);
});

test('featured unavailable control stays inside the product card on narrow screens', () => {
  const css = readText('home.css');

  assert.match(
    css,
    /\.featured-add\.is-unavailable\s*\{[^}]*width:\s*auto;[^}]*max-width:\s*100%;[^}]*white-space:\s*nowrap;/s,
  );
});

test('dark theme uses a dedicated wordmark without a light backing plate', () => {
  const html = readText('home.html');
  const css = readText('client-theme.css');

  assert.match(html, /brand-wordmark--dark/);
  assert.match(html, /assets\/mobile-home\/brand-wordmark-dark\.webp\?v=2026081403/);
  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.brand-wordmark--light\s*\{[^}]*display:\s*none\s*!important;/s,
  );
  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.brand-wordmark--dark\s*\{[^}]*display:\s*block;/s,
  );
  assert.doesNotMatch(
    css,
    /html\[data-theme='dark'\]\s+\.brand-wordmark\s*\{[^}]*background:\s*#f7f6f3;/s,
  );
});

test('dark wordmark has no opaque white halo around the red line', async () => {
  const { data, info } = await sharp('assets/mobile-home/brand-wordmark-dark.webp')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let haloPixels = 0;

  for (let y = 54; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];

      if (alpha > 32 && red > 190 && green > 100 && blue > 100) {
        haloPixels += 1;
      }
    }
  }

  assert.equal(haloPixels, 0);
});

test('desktop featured product uses the supplied real food asset', () => {
  const html = readText('home.html');
  const css = readText('home.css');

  assert.match(
    html,
    /<source\s+media="\(min-width: 1024px\)"\s+srcset="assets\/mobile-home\/hit-sales-owner\.webp"\s*\/>/,
  );
  assert.match(
    css,
    /@media \(min-width:\s*1024px\)[\s\S]*?#popular \.product-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*62fr\)\s+minmax\(320px,\s*38fr\);/s,
  );
  assert.doesNotMatch(html, /classic-shawarma-hit-wide\.png|assets\/catalog\/classic-shawarma\.webp/);
});

test('home footer and desktop cart use deliberate responsive structures', () => {
  const homeHtml = readText('home.html');
  const homeCss = readText('home.css');
  const cartHtml = readText('cart.html');
  const cartCss = readText('cart.css');

  assert.match(homeHtml, /class="client-footer__brand"/);
  assert.match(homeHtml, /class="client-footer__wordmark client-footer__wordmark--light"/);
  assert.match(homeHtml, /class="client-footer__wordmark client-footer__wordmark--dark"/);
  assert.match(homeHtml, /class="client-footer__address-label">Адрес<\/span>/);
  assert.match(
    homeHtml,
    /<address class="client-footer__address-value">Волоколамское шоссе, 71\/22к2<\/address>/,
  );
  assert.match(homeHtml, /class="client-footer__legal-band"/);
  assert.match(
    homeCss,
    /@media \(min-width:\s*1024px\)[\s\S]*?\.client-footer\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*1fr\)\s+auto;/s,
  );
  assert.match(homeCss, /\.client-footer__legal-band\s*\{[^}]*border-top:\s*1px solid var\(--color-line\);/s);

  assert.match(cartHtml, /class="cart-layout"/);
  assert.match(cartHtml, /class="cart-sidebar"/);
  assert.match(cartHtml, /class="client-footer__legal cart-legal-footer"/);
  assert.match(
    cartHtml,
    /<\/aside>\s*<\/div>\s*<nav class="client-footer__legal cart-legal-footer"/s,
  );
  assert.match(
    cartCss,
    /@media \(min-width:\s*1024px\)[\s\S]*?\.cart-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(320px,\s*360px\);/s,
  );
  assert.match(
    cartCss,
    /@media \(min-width:\s*1024px\)[\s\S]*?\.recommendation-list\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s,
  );
  assert.match(
    cartCss,
    /@media \(min-width:\s*1024px\)[\s\S]*?\.cart-sidebar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*100px;/s,
  );
  assert.match(
    cartCss,
    /@media \(min-width:\s*1024px\)[\s\S]*?\.cart-checkout\s*\{[^}]*position:\s*static;/s,
  );
});

test('свежая демонстрационная версия содержит все основные страницы', () => {
  for (const page of requiredPages) {
    assert.match(readText(page), /<!doctype html>/i, page);
  }
});

test('переключатель курицы и говядины стоит отдельной строкой под заголовком шаурмы', () => {
  const html = readText('home.html');
  const css = readText('home.css');
  const heading = html.match(/<div class="menu-section__heading">([\s\S]*?)<\/div>\s*<div class="menu-list"/)?.[1] ?? '';

  assert.ok(heading.indexOf('data-home-menu-title') < heading.indexOf('data-home-meat-switch'));
  assert.match(css, /\.menu-section__heading\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(css, /\[data-home-meat-switch\]\s*\{[^}]*width:\s*100%;/s);
});

test('текстовая карточка соуса остаётся компактной на компьютере', () => {
  const html = readText('home.html');
  const css = readText('home.css');

  assert.match(html, /href="home\.css\?v=2026081702"/);
  assert.match(
    css,
    /\.menu-product\.menu-product--text\s*\{[^}]*min-height:\s*76px;/s,
  );
  assert.match(
    css,
    /@media \(min-width:\s*1024px\)[\s\S]*?\.menu-product--text\s*\{[^}]*min-height:\s*76px;/s,
  );
});

test('добавки в тёмной теме используют тёмную поверхность', () => {
  const css = readText('client-theme.css');

  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.product-sheet__addon\s*\{[^}]*background:\s*var\(--control-surface\);/s,
  );
});

test('бренд в шапке кухни является статичным и не открывает страницу', () => {
  const html = readText('kitchen.html');

  assert.doesNotMatch(html, /<a\s+class="kitchen-brand"/);
  assert.match(html, /<div\s+class="kitchen-brand">/);
});

test('dark product sauce rows use readable theme variables', () => {
  const css = readText('client-theme.css');
  assert.match(css, /html\[data-theme='dark'\]\s+\.product-sheet__sauce/);
  assert.match(css, /\.product-sheet__sauce[\s\S]*?color:\s*var\(--client-text\)/);
  assert.match(css, /\.product-sheet__sauce[\s\S]*?background:\s*var\(--control-surface\)/);
  assert.match(
    css,
    /html\[data-theme='dark'\]\s+\.product-sheet__sauce\s*\{[^}]*color:\s*var\(--client-text\);[^}]*background:\s*var\(--control-surface\);[^}]*border-color:\s*var\(--control-border\);[^}]*\}/s,
  );
});
