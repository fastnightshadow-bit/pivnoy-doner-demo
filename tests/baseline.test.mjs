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
