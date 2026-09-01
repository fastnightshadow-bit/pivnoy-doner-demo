import test from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORIES, PRODUCTS } from '../catalog-data.js';
import { getMenuProducts } from '../home-menu.js';
import { createKioskState, reduceKioskState } from '../kiosk-state.js';
import { renderKiosk } from '../kiosk-presentation.js';
import { calculateProductPrice, getProductConfiguration } from '../product-config.js';

const settings = {
  acceptingOrders: true,
  stoppedProductIds: [],
  stoppedMeatIds: [],
  stoppedSauceIds: [],
  stoppedAddonIds: [],
};

const catalogState = () => {
  let state = reduceKioskState(createKioskState(), { type: 'START' });
  state = reduceKioskState(state, {
    type: 'SET_FULFILLMENT',
    value: 'dine-in',
  });
  return state;
};

test('веганская категория продаёт шаурму с фалафелем за 350 ₽ на сайте и в киоске', () => {
  const category = CATEGORIES.find(({ id }) => id === 'vegan');
  const product = PRODUCTS.find(({ id }) => id === 'falafel-shawarma');

  assert.deepEqual(category, { id: 'vegan', label: 'Веган', icon: 'leaf' });
  assert.deepEqual(
    product,
    {
      id: 'falafel-shawarma',
      category: 'vegan',
      name: 'Шаурма с фалафелем',
      description: 'Фалафель, лаваш, салат, огурец, томат и фирменный соус',
      price: 350,
      pricePrefix: '',
      badge: 'Новинка',
      image: 'assets/catalog/classic-shawarma.webp',
      icon: 'leaf',
      configurable: false,
    },
  );
  assert.deepEqual(getMenuProducts('vegan').map(({ id }) => id), [
    'falafel-shawarma',
  ]);

  const markup = renderKiosk(catalogState(), {
    products: PRODUCTS,
    settings,
    connected: true,
    activeCategory: 'vegan',
  });
  assert.match(markup, /data-kiosk-category="vegan"/);
  assert.match(markup, /data-kiosk-product="falafel-shawarma"/);
  assert.match(markup, /Шаурма с фалафелем/);
  assert.match(markup, />350\s*₽</);
});

test('фалафель имеет одну фиксированную цену без мясных и размерных вариантов', () => {
  assert.deepEqual(getProductConfiguration('falafel-shawarma'), {
    prices: { default: { single: 350 } },
    addons: [],
    sauces: [],
  });
  assert.equal(calculateProductPrice('falafel-shawarma'), 350);
});

test('категория соусов получает отдельную компактную раскладку', () => {
  const markup = renderKiosk(catalogState(), {
    products: PRODUCTS,
    settings,
    connected: true,
    activeCategory: 'sauces',
  });

  assert.match(markup, /class="kiosk-products is-compact"/);
  assert.match(markup, /class="kiosk-product kiosk-touch is-text-only"/);
});
