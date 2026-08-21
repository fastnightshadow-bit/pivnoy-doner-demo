import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';
import { buildCategorySummaries } from '../owner-menu.js';
import { normalizeKitchenSettings } from '../kitchen-settings.js';
import { renderKitchenMenu } from '../kitchen-menu.js';

test('кухня открывает управление меню отдельным полноэкранным представлением', () => {
  const html = readText('kitchen.html');

  assert.match(html, /data-kitchen-menu-view/);
  assert.match(html, /data-kitchen-menu-search/);
  assert.match(html, /data-kitchen-menu-list/);
  assert.match(html, /data-kitchen-menu-close/);
  assert.doesNotMatch(html, /<dialog class="settings-dialog"/);
});

test('переключатели кухни используют фирменные чёрный и красный цвета', () => {
  const css = readText('kitchen.css');

  assert.match(css, /\.availability-switch\[aria-checked=['"]true['"]\][^{]*\{[^}]*background:\s*#171717/s);
  assert.match(css, /\.availability-switch\[aria-checked=['"]false['"]\][^{]*\{[^}]*background:\s*var\(--kitchen-red\)/s);
  assert.match(css, /\.kitchen-menu-toggle input:checked \+ i[^{]*\{[^}]*background:\s*#171717/s);
  assert.match(css, /\.kitchen-menu-toggle i[^{]*\{[^}]*background:\s*var\(--kitchen-red\)/s);
  assert.match(css, /\.kitchen-menu-view[^\{]*\{[^}]*position:\s*fixed/s);
});

test('кухонное меню показывает категории, блюда и опции одним форматом', () => {
  const html = renderKitchenMenu({
    categories: buildCategorySummaries(),
    settings: normalizeKitchenSettings({ stoppedMeatIds: ['beef'] }),
    query: '',
    expandedIds: new Set(['classic-shawarma']),
  });

  assert.match(html, /data-kitchen-category-toggle="shawarma"/);
  assert.match(html, /data-kitchen-product-toggle="classic-shawarma"/);
  assert.match(html, /data-kitchen-option-toggle="meat:beef"/);
  assert.match(html, /Нет в наличии/);
});
