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

test('управление кухни повторяет структуру владельца с глобальным выбором мяса', () => {
  const html = readText('kitchen.html');
  const css = readText('kitchen.css');

  assert.match(html, /class="kitchen-menu-service-card__copy"/);
  assert.match(html, /class="kitchen-menu-global-meats"/);
  assert.match(html, /data-kitchen-global-meats/);
  assert.match(html, /Мясо во всём меню/);
  assert.match(css, /\.kitchen-menu-global-meats__grid/);
  assert.match(css, /\.kitchen-menu-chevron/);
});

test('переключатели кухни используют фирменные чёрный и красный цвета', () => {
  const css = readText('kitchen.css');

  assert.match(css, /\.availability-switch\[aria-checked=['"]true['"]\][^{]*\{[^}]*background:\s*var\(--kitchen-red\)/s);
  assert.match(css, /\.availability-switch\[aria-checked=['"]false['"]\][^{]*\{[^}]*background:\s*#d0d0cc/s);
  assert.match(css, /\.kitchen-menu-toggle input:checked \+ i[^{]*\{[^}]*background:\s*var\(--kitchen-red\)/s);
  assert.match(css, /\.kitchen-menu-toggle i[^{]*\{[^}]*background:\s*#d0d0cc/s);
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

test('экран управления открывается до сетевой загрузки и не вызывает клавиатуру планшета', () => {
  const source = readText('kitchen.js');
  const start = source.indexOf('const openKitchenSettings =');
  const end = source.indexOf('const closeKitchenSettings =', start);
  const body = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.ok(
    body.indexOf('setElementHidden(refs.menuView, false)') <
      body.indexOf('await loadKitchenSettings'),
    'menu must become visible before the settings request finishes',
  );
  assert.doesNotMatch(body, /menuSearch\?\.focus/);
});

test('landscape kitchen tablet gets touch-sized controls and readable order cards', () => {
  const css = readText('kitchen.css');

  assert.match(css, /@media[^\{]*pointer:\s*coarse[^\{]*max-width:\s*1366px/s);
  assert.match(css, /@media[^\{]*pointer:\s*coarse[\s\S]*?\.order-card__action\s*\{[^}]*min-height:\s*56px/s);
  assert.match(css, /@media[^\{]*pointer:\s*coarse[\s\S]*?\.order-card__item\s*\{[^}]*font-size:\s*14px/s);
  assert.match(css, /button[^\{]*\{[^}]*touch-action:\s*manipulation/s);
});
