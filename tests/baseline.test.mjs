import test from 'node:test';
import assert from 'node:assert/strict';
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
];

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

  assert.match(html, /href="home\.css\?v=20260807"/);
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
