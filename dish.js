import {
  addCartLine,
  changeCartLineQuantity,
  createCartLine,
} from './cart-state.js';
import { loadCart, saveCart } from './cart-storage.js?v=2026090101';
import { PRODUCTS } from './catalog-data.js?v=2026090101';
import { pulseMotion, revealMotion } from './motion.js';
import {
  calculateProductPrice,
  getProductConfiguration,
  getProductDescription,
  getSizeLabelWithWeight,
  MEAT_LABELS,
  PRODUCT_ADDONS,
} from './product-config.js?v=2026090101';

export const DISH_NAME = 'Классическая шаурма';
const DISH_ID = 'classic-shawarma';
const DISH_PRODUCT = PRODUCTS.find(({ id }) => id === DISH_ID);

export const PRICE_MATRIX = getProductConfiguration(DISH_ID).prices;

export const ADDON_PRICES = Object.freeze(
  Object.fromEntries(
    Object.entries(PRODUCT_ADDONS).map(([id, addon]) => [id, addon.price]),
  ),
);

export const calculateUnitPrice = (selection) =>
  calculateProductPrice(DISH_ID, selection);

export const calculateTotal = (config, quantity = 1) =>
  calculateUnitPrice(config) * Math.max(0, Number(quantity) || 0);

export const changeDishQuantity = (quantity, delta) =>
  Math.max(0, (Number(quantity) || 0) + (Number(delta) || 0));

export const getDescription = (meat) =>
  getProductDescription(DISH_PRODUCT, meat);

const ADDON_LABELS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(PRODUCT_ADDONS).map(([id, addon]) => [id, addon.label]),
  ),
});

function initDishScreen() {
  const state = {
    meat: 'chicken',
    size: 'standard',
    addons: new Set(),
    quantity: 0,
    favorite: false,
    cartLineId: '',
  };
  const unitPriceNodes = [...document.querySelectorAll('[data-unit-price]')];
  const totalPriceNode = document.querySelector('[data-total-price]');
  const descriptionNode = document.querySelector('[data-description]');
  const addToCartButton = document.querySelector('[data-add-to-cart]');
  const quantityPanel = document.querySelector('[data-quantity-panel]');
  const quantityOutput = document.querySelector('[data-quantity-output]');
  const favoriteButton = document.querySelector('[data-favorite]');
  const commentInput = document.querySelector('[data-comment]');
  const toast = document.querySelector('[data-toast]');
  let toastTimer;

  const currentConfig = () => ({
    meat: state.meat,
    size: state.size,
    addons: [...state.addons],
  });

  const formatPrice = (price) => `${price} ₽`;

  const createCurrentCartLine = () =>
    createCartLine({
      productId: DISH_ID,
      name: DISH_NAME,
      unitPrice: calculateUnitPrice(currentConfig()),
      meat: MEAT_LABELS[state.meat],
      size: getSizeLabelWithWeight(state.size),
      addons: [...state.addons].map((addon) => ADDON_LABELS[addon]),
      comment: commentInput?.value || '',
      image: 'assets/mobile-home/hero-enhanced.webp',
      icon: 'wrap',
    });

  const saveCurrentQuantity = (delta) => {
    let lines = loadCart(window.localStorage);
    if (!state.cartLineId && delta > 0) {
      const line = createCurrentCartLine();
      lines = addCartLine(lines, line);
      state.cartLineId = line.lineId;
    } else if (state.cartLineId) {
      lines = changeCartLineQuantity(lines, state.cartLineId, delta);
    }
    saveCart(window.localStorage, lines);
    state.quantity =
      lines.find(({ lineId }) => lineId === state.cartLineId)?.quantity || 0;
    if (state.quantity === 0) state.cartLineId = '';
  };

  const resetCurrentSelection = () => {
    state.quantity = 0;
    state.cartLineId = '';
  };

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
  };

  const render = ({ animatePrice = false } = {}) => {
    const unitPrice = calculateUnitPrice(currentConfig());
    const displayedTotal =
      state.quantity > 0 ? calculateTotal(currentConfig(), state.quantity) : unitPrice;

    unitPriceNodes.forEach((node) => {
      node.textContent = formatPrice(unitPrice);
    });
    if (totalPriceNode) totalPriceNode.textContent = formatPrice(displayedTotal);
    if (descriptionNode) descriptionNode.textContent = getDescription(state.meat);
    if (addToCartButton) addToCartButton.hidden = state.quantity > 0;
    if (quantityPanel) quantityPanel.hidden = state.quantity === 0;
    if (quantityOutput) quantityOutput.textContent = String(state.quantity);

    document.querySelectorAll('[data-size-price]').forEach((node) => {
      node.textContent = formatPrice(PRICE_MATRIX[state.meat][node.dataset.sizePrice]);
    });

    if (animatePrice) {
      pulseMotion(totalPriceNode);
      unitPriceNodes.forEach((node) => pulseMotion(node));
    }
  };

  document.querySelectorAll('[data-meat]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.meat = input.value;
      resetCurrentSelection();
      render({ animatePrice: true });
      revealMotion(addToCartButton);
    });
  });

  document.querySelectorAll('[data-size]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.size = input.value;
      resetCurrentSelection();
      render({ animatePrice: true });
      revealMotion(addToCartButton);
    });
  });

  document.querySelectorAll('[data-addon]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.addons.add(input.value);
      else state.addons.delete(input.value);
      resetCurrentSelection();
      render({ animatePrice: true });
      revealMotion(addToCartButton);
    });
  });

  favoriteButton?.addEventListener('click', () => {
    state.favorite = !state.favorite;
    favoriteButton.classList.toggle('is-active', state.favorite);
    favoriteButton.setAttribute('aria-pressed', String(state.favorite));
    favoriteButton.setAttribute(
      'aria-label',
      state.favorite ? 'Убрать из избранного' : 'Добавить в избранное',
    );
    pulseMotion(favoriteButton);
    showToast(state.favorite ? 'Добавлено в избранное' : 'Удалено из избранного');
  });

  addToCartButton?.addEventListener('click', () => {
    saveCurrentQuantity(1);
    render({ animatePrice: true });
    revealMotion(quantityPanel);
    pulseMotion(quantityOutput);
    showToast('Классическая шаурма добавлена');
  });

  document.querySelectorAll('[data-quantity-change]').forEach((button) => {
    button.addEventListener('click', () => {
      saveCurrentQuantity(Number(button.dataset.quantityChange));
      render({ animatePrice: true });
      if (state.quantity > 0) pulseMotion(quantityOutput);
      else revealMotion(addToCartButton);
      showToast(state.quantity > 0 ? 'Количество обновлено' : 'Удалено из корзины');
    });
  });

  document.querySelectorAll('[data-recommendation]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = PRODUCTS.find(
        ({ name }) => name === button.dataset.recommendation,
      );
      if (product) {
        const lines = addCartLine(
          loadCart(window.localStorage),
          createCartLine({
            productId: product.id,
            name: product.name,
            unitPrice: product.price,
            image: product.image,
            icon: product.icon,
          }),
        );
        saveCart(window.localStorage, lines);
      }
      button.classList.add('is-added');
      button.setAttribute('aria-pressed', 'true');
      pulseMotion(button);
      showToast(`«${button.dataset.recommendation}» добавлено`);
    });
  });

  render();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDishScreen, { once: true });
  } else {
    initDishScreen();
  }
}
