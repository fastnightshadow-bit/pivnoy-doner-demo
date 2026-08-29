import test from 'node:test';
import assert from 'node:assert/strict';

import { PRODUCTS } from '../catalog-data.js';
import { createKioskState, reduceKioskState } from '../kiosk-state.js';
import { renderKiosk } from '../kiosk-presentation.js';
import { createKioskSessionController } from '../kiosk-session.js';
import { readText } from './helpers.mjs';

const context = {
  products: PRODUCTS,
  settings: {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  },
  connected: true,
  activeCategory: 'shawarma',
  selection: { meat: 'chicken', size: 'standard', sauce: 'tasty', addons: [], quantity: 1 },
};

test('выбор способа получения использует две фирменные залитые иллюстрации', () => {
  const state = reduceKioskState(createKioskState(), { type: 'START' });
  const markup = renderKiosk(state, context);

  assert.equal((markup.match(/kiosk-choice-illustration/g) || []).length, 2);
  assert.match(markup, /kiosk-choice-illustration is-dine-in/);
  assert.match(markup, /kiosk-choice-illustration is-takeaway/);
  assert.match(markup, /<svg[^>]+viewBox="0 0 64 64"/);
});

test('фотография товара находится в отдельной безопасной сцене с нижним воздухом', () => {
  const state = {
    ...createKioskState(),
    screen: 'product',
    fulfillment: 'takeaway',
    selectedProductId: 'classic-shawarma',
  };
  const markup = renderKiosk(state, context);
  const css = readText('kiosk-fixes-v3.css');

  assert.match(markup, /kiosk-sheet-hero[^>]*>[\s\S]*?kiosk-sheet-image-stage[^>]*>[\s\S]*?<img/);
  assert.match(css, /\.kiosk-sheet-image-stage\s*\{[^}]*position:\s*relative/);
  assert.match(css, /\.kiosk-sheet-image-stage img\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.kiosk-sheet-image-stage img\s*\{[^}]*inset:\s*24px 64px 48px/);
  assert.match(css, /\.kiosk-sheet-image-stage img\s*\{[^}]*height:\s*calc\(100% - 72px\)/);
});

test('полная сессия длится 60 секунд, предупреждение показывается за 10 секунд', () => {
  const timers = [];
  const controller = createKioskSessionController({
    setTimeoutImpl: (callback, delay) => { timers.push({ callback, delay, cleared: false }); return timers.length - 1; },
    clearTimeoutImpl: (id) => { if (timers[id]) timers[id].cleared = true; },
  });

  controller.sync({ screen: 'cart', lines: [{ quantity: 1 }] });

  assert.deepEqual(timers.filter(({ cleared }) => !cleared).map(({ delay }) => delay), [50_000, 60_000]);
});

test('любое движение, касание и прокрутка считаются активностью', async () => {
  const eventNames = [];
  const original = {
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    MutationObserver: globalThis.MutationObserver,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };

  const root = {
    firstElementChild: {},
    querySelector: (selector) => selector === '.kiosk-start' ? {} : null,
  };
  globalThis.document = {
    querySelector: () => root,
    addEventListener: (name) => eventNames.push(name),
    body: { append() {} },
  };
  globalThis.window = { location: { reload() {} } };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  globalThis.MutationObserver = class { observe() {} };
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  try {
    await import(`../kiosk-session-runtime.js?activity-test=${Date.now()}`);
  } finally {
    globalThis.document = original.document;
    globalThis.window = original.window;
    Object.defineProperty(globalThis, 'navigator', { value: original.navigator, configurable: true, writable: true });
    globalThis.MutationObserver = original.MutationObserver;
    globalThis.setTimeout = original.setTimeout;
    globalThis.clearTimeout = original.clearTimeout;
  }

  for (const name of ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel', 'scroll', 'keydown']) {
    assert.ok(eventNames.includes(name), `событие ${name} должно сбрасывать таймер`);
  }
});
