import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './helpers.mjs';

test('плюсы, минусы и крестики центрируются без дробного translate', () => {
  const css = readText('kiosk-fixes-v3.css');
  assert.match(css, /\.kiosk-plus-glyph::before,[\s\S]*?inset:\s*0;[\s\S]*?margin:\s*auto;/);
  assert.match(css, /\.kiosk-close-glyph::before\s*\{\s*transform:\s*rotate\(45deg\)/);
  assert.doesNotMatch(css, /translate\(-50%,\s*-50%\)/);
});

test('карточка блюда сохраняет место для описания даже на низком экране', () => {
  const css = readText('kiosk-fixes-v3.css');
  assert.match(css, /\.kiosk-product-sheet\s*\{[^}]*height:\s*min\(94dvh,\s*900px\)/);
  assert.match(css, /grid-template-rows:\s*clamp\(220px,\s*38dvh,\s*420px\)\s+minmax\(120px,\s*1fr\)\s+auto/);
  assert.match(css, /\.kiosk-sheet-hero\s*\{[^}]*height:\s*auto/);
});

test('экран карты не может вернуть старую красную дугу', () => {
  const css = readText('kiosk-fixes-v3.css');
  const polishCss = readText('kiosk-polish.css');
  assert.match(css, /\.kiosk-terminal-art\s+em\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(polishCss, /\.kiosk-payment-card-art[^\{]*\{[^}]*background:/);
});

test('итог корзины оптически поднят к центру кнопки', () => {
  const css = readText('kiosk-fixes-v3.css');
  assert.match(css, /\.kiosk-cart-checkout\s*>\s*div\s*\{[^}]*transform:\s*translateY\(-5px\)/);
});

test('версия ресурсов киоска меняется вместе с исправлениями', () => {
  const html = readText('kiosk.html');
  assert.match(html, /kiosk-fixes-v3\.css\?v=20260823-8/);
  assert.match(html, /kiosk-app\.js\?v=20260823-8/);
});


test('логотип в планшетной шапке имеет явный оптический центр', () => {
  const css = readText('kiosk-fixes-v3.css');
  assert.match(css, /\.kiosk-menu-header \.kiosk-brand\s*\{[^}]*align-self:\s*center/);
  assert.match(css, /\.kiosk-menu-header \.kiosk-brand\s*\{[^}]*transform:\s*translate\(-2px,\s*3px\)/);
  assert.match(css, /\.kiosk-topbar \.kiosk-brand\s*\{[^}]*transform:\s*translate\(-2px,\s*3px\)/);
});
