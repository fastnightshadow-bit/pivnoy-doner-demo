import test from 'node:test';
import assert from 'node:assert/strict';

import { PRODUCTS } from '../catalog-data.js';
import { createKioskState, reduceKioskState } from '../kiosk-state.js';
import {
  getKioskAvailability,
  renderKiosk,
} from '../kiosk-presentation.js';
import { readText } from './helpers.mjs';

const emptySettings = {
  acceptingOrders: true,
  stoppedProductIds: [],
  stoppedMeatIds: [],
  stoppedSauceIds: [],
  stoppedAddonIds: [],
};

const context = {
  products: PRODUCTS,
  settings: emptySettings,
  connected: true,
  activeCategory: 'shawarma',
  selection: {
    meat: 'chicken',
    size: 'standard',
    sauce: 'tasty',
    addons: [],
    quantity: 1,
  },
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

test('каталог показывает категории, реальные блюда и нижнюю корзину', () => {
  let state = reduceKioskState(createKioskState(), { type: 'START' });
  state = reduceKioskState(state, { type: 'SET_FULFILLMENT', value: 'dine-in' });
  const markup = renderKiosk(state, context);

  assert.match(markup, /data-kiosk-category="shawarma"/);
  assert.match(markup, /Классическая шаурма/);
  assert.match(markup, /data-kiosk-product="classic-shawarma"/);
  assert.match(markup, /data-kiosk-cart/);
});

test('стоп-лист блокирует мясо и объясняет причину', () => {
  const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
  assert.deepEqual(
    getKioskAvailability(
      product,
      { meat: 'chicken', size: 'standard' },
      { ...emptySettings, stoppedMeatIds: ['chicken'] },
    ),
    { available: false, reason: 'Курица временно недоступна' },
  );
});

test('карточка блюда содержит крупные опции и добавление в корзину', () => {
  const state = {
    ...createKioskState(),
    screen: 'product',
    fulfillment: 'takeaway',
    selectedProductId: 'classic-shawarma',
  };
  const markup = renderKiosk(state, context);

  assert.match(markup, /data-kiosk-option="meat"/);
  assert.match(markup, /data-kiosk-option="size"/);
  assert.match(markup, /data-kiosk-add-line/);
  assert.match(markup, /Добавить/);
  assert.match(markup, /300\s*₽/);
});

test('основные элементы стойки рассчитаны на крупное касание', () => {
  const css = readText('kiosk.css');
  assert.match(css, /\.kiosk-touch[\s\S]*min-height:\s*56px/);
  assert.match(css, /\.kiosk-primary[\s\S]*min-height:\s*76px/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)/);
});

test('визуальная система стойки использует чистый белый фон без горизонтальной прокрутки опций', () => {
  const baseCss = readText('kiosk.css');
  const catalogCss = readText('kiosk-catalog.css');
  const cartCss = readText('kiosk-cart.css');
  const paymentCss = readText('kiosk-payment.css');

  assert.match(baseCss, /--kiosk-bg:\s*#fff(?:fff)?\s*;/i);
  assert.match(baseCss, /--kiosk-surface:\s*#fff(?:fff)?\s*;/i);
  assert.doesNotMatch(`${catalogCss}${cartCss}${paymentCss}`, /#f8f5f0/i);
  assert.match(catalogCss, /\.kiosk-sauce-row\{[^}]*grid-template-columns:/);
  assert.doesNotMatch(catalogCss, /\.kiosk-sauce-row\{[^}]*overflow-x:\s*auto/);
});

test('карточка блюда использует SVG-крестик и показывает фотографию целиком', () => {
  const state = {
    ...createKioskState(),
    screen: 'product',
    fulfillment: 'takeaway',
    selectedProductId: 'classic-shawarma',
  };
  const markup = renderKiosk(state, context);
  const css = readText('kiosk-catalog.css');

  assert.match(markup, /data-kiosk-close-product[^>]*>[\s\S]*?<svg/);
  assert.doesNotMatch(markup, /aria-label="Закрыть">×<\/button>/);
  assert.match(markup, /kiosk-sheet-hero[^>]*>[\s\S]*?alt="Классическая шаурма"/);
  assert.match(css, /\.kiosk-sheet-hero img\{[^}]*object-fit:\s*contain/);
});

test('счётчики количества имеют единый белый фон', () => {
  const catalogCss = readText('kiosk-catalog.css');
  const cartCss = readText('kiosk-cart.css');

  assert.match(catalogCss, /\.kiosk-quantity(?:>| )[^,{]*button\{[^}]*background:\s*#fff/);
  assert.match(catalogCss, /\.kiosk-quantity(?:>| )[^,{]*strong\{[^}]*background:\s*#fff/);
  assert.match(cartCss, /\.kiosk-line-quantity(?:>| )[^,{]*button\{[^}]*background:\s*#fff/);
  assert.match(cartCss, /\.kiosk-line-quantity(?:>| )[^,{]*b\{[^}]*background:\s*#fff/);
});
