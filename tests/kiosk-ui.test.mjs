import test from 'node:test';
import assert from 'node:assert/strict';

import { createKioskState, reduceKioskState } from '../kiosk-state.js';
import { renderKiosk } from '../kiosk-presentation.js';
import { readText } from './helpers.mjs';

const context = {
  products: [],
  settings: {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  },
  connected: true,
};

test('стойка имеет отдельную страницу и одну кнопку на старте', () => {
  const html = readText('kiosk.html');
  assert.match(html, /data-kiosk-app/);
  assert.match(html, /kiosk\.webmanifest/);

  const start = renderKiosk(createKioskState(), context);
  const visibleText = start.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(visibleText, /Вкус, который хочется повторить/);
  assert.match(start, /Начать заказ/);
  assert.doesNotMatch(start, /Оплата картой/);
  assert.equal((start.match(/<button\b/g) || []).length, 1);
});

test('после старта показывается выбор Здесь или С собой', () => {
  const state = reduceKioskState(createKioskState(), { type: 'START' });
  const markup = renderKiosk(state, context);

  assert.match(markup, />Здесь</);
  assert.match(markup, />С собой</);
  assert.match(markup, /data-kiosk-back/);
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
});

test('основные элементы стойки рассчитаны на крупное касание', () => {
  const css = readText('kiosk.css');
  assert.match(css, /\.kiosk-touch[\s\S]*min-height:\s*56px/);
  assert.match(css, /\.kiosk-primary[\s\S]*min-height:\s*76px/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)/);
});
