import { PRODUCTS } from './catalog-data.js';
import { addCartLine, createCartLine } from './cart-state.js';
import {
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  getProductConfiguration,
} from './product-config.js';
import { createKioskState, reduceKioskState } from './kiosk-state.js';
import { createDemoKioskApi, createKioskApi, isKioskDemoLocation } from './kiosk-api.js';
import { getKioskAvailability, renderKiosk } from './kiosk-presentation.js';

const root = document.querySelector('[data-kiosk-app]');
const api = isKioskDemoLocation(window.location) ? createDemoKioskApi() : createKioskApi();

let state = createKioskState();
let context = {
  products: [],
  activeCategory: 'shawarma',
  selection: null,
  settings: {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  },
  connected: true,
};

const render = () => { root.innerHTML = renderKiosk(state, context); };

const dispatch = (event) => {
  const next = reduceKioskState(state, event);
  if (next === state) return;
  state = next;
  render();
};

const findProduct = (productId) =>
  (context.products?.length ? context.products : PRODUCTS).find(({ id }) => id === productId);

const createDefaultSelection = (productId) => {
  const config = getProductConfiguration(productId);
  const meats = getAvailableMeats(productId);
  const meat = meats.find((id) => !(context.settings.stoppedMeatIds || []).includes(id)) || meats[0] || 'default';
  return {
    meat,
    size: getAvailableSizes(productId, meat)[0] || 'single',
    sauce: config?.defaultSauce || '',
    addons: [],
    quantity: 1,
  };
};

const updateSelection = (changes) => {
  context = { ...context, selection: { ...context.selection, ...changes } };
  render();
};

const closeProduct = () => {
  context = { ...context, selection: null };
  dispatch({ type: 'CLOSE_PRODUCT' });
};

root.addEventListener('click', (event) => {
  if (event.target.closest('[data-kiosk-start]')) return dispatch({ type: 'START' });

  const fulfillment = event.target.closest('[data-kiosk-fulfillment]');
  if (fulfillment) return dispatch({ type: 'SET_FULFILLMENT', value: fulfillment.dataset.kioskFulfillment });

  const category = event.target.closest('[data-kiosk-category]');
  if (category) {
    context = { ...context, activeCategory: category.dataset.kioskCategory };
    render();
    return;
  }

  const productButton = event.target.closest('[data-kiosk-product]');
  if (productButton) {
    const productId = productButton.dataset.kioskProduct;
    context = { ...context, selection: createDefaultSelection(productId) };
    dispatch({ type: 'OPEN_PRODUCT', productId });
    return;
  }

  if (event.target.closest('[data-kiosk-close-product]')) return closeProduct();

  const meat = event.target.closest('[data-kiosk-set-meat]');
  if (meat) {
    const value = meat.dataset.kioskSetMeat;
    updateSelection({ meat: value, size: getAvailableSizes(state.selectedProductId, value)[0] || 'single' });
    return;
  }

  const size = event.target.closest('[data-kiosk-set-size]');
  if (size) return updateSelection({ size: size.dataset.kioskSetSize });

  const sauce = event.target.closest('[data-kiosk-set-sauce]');
  if (sauce) return updateSelection({ sauce: sauce.dataset.kioskSetSauce });

  const addon = event.target.closest('[data-kiosk-toggle-addon]');
  if (addon) {
    const value = addon.dataset.kioskToggleAddon;
    const current = context.selection.addons || [];
    updateSelection({ addons: current.includes(value) ? current.filter((id) => id !== value) : [...current, value] });
    return;
  }

  const quantity = event.target.closest('[data-kiosk-product-quantity]');
  if (quantity) {
    updateSelection({ quantity: Math.max(1, (context.selection.quantity || 1) + Number(quantity.dataset.kioskProductQuantity)) });
    return;
  }

  if (event.target.closest('[data-kiosk-add-line]')) {
    const product = findProduct(state.selectedProductId);
    const selection = context.selection;
    const availability = getKioskAvailability(product, selection, context.settings);
    if (!availability.available) return;
    const line = createCartLine({
      productId: product.id,
      name: product.name,
      unitPrice: calculateProductPrice(product.id, selection),
      meat: selection.meat,
      size: selection.size,
      sauce: selection.sauce,
      addons: selection.addons,
      quantity: selection.quantity,
      image: product.image,
      icon: product.icon,
    });
    state = reduceKioskState(state, { type: 'SET_LINES', lines: addCartLine(state.lines, line) });
    closeProduct();
    return;
  }

  if (event.target.closest('[data-kiosk-cart]')) return dispatch({ type: 'OPEN_CART' });
  if (event.target.closest('[data-kiosk-back]')) dispatch({ type: 'BACK' });
});

const start = async () => {
  try {
    const bootstrap = await api.getBootstrap();
    context = { ...context, ...bootstrap };
    render();
    api.subscribe(
      (message) => {
        if (message.type !== 'settings.updated') return;
        context = { ...context, settings: message.settings };
        if (state.screen === 'product') {
          const product = findProduct(state.selectedProductId);
          const availability = getKioskAvailability(product, context.selection, context.settings);
          if (!availability.available) closeProduct();
        }
        render();
      },
      (connected) => { context = { ...context, connected }; render(); },
    );
  } catch (error) {
    root.innerHTML = `<section class="kiosk-fatal" role="alert"><img src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" /><h1>Не удалось загрузить меню</h1><p>${String(error?.message || 'Проверьте подключение к интернету')}</p><button class="kiosk-primary kiosk-touch" type="button" onclick="location.reload()">Повторить</button></section>`;
  }
};

start();
