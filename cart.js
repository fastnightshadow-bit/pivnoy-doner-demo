import { PRODUCTS } from './catalog-data.js';
import {
  addCartLine,
  calculateCartSummary,
  changeCartLineQuantity,
  createCartLine,
  getCartItemCount,
} from './cart-state.js';
import { loadCart, saveCart } from './cart-storage.js';
import { loadFulfillment } from './fulfillment-storage.js';
import {
  pulseMotion,
  revealMotion,
  staggerMotion,
} from './motion.js';
import {
  getSizeLabelWithWeight,
  SIZE_LABELS,
} from './product-config.js';

export const CART_RECOMMENDATION_IDS = Object.freeze([
  'fries',
  'country-potatoes',
  'nuggets',
  'cheese-sticks',
  'squid-rings',
  'breaded-shrimps',
]);

const supportedIcons = new Set(['bag', 'wrap', 'fries', 'bites', 'cheese']);

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const formatCartPrice = (value) =>
  `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')}&nbsp;₽`;

export const createCartSummary = (lines) => calculateCartSummary(lines);

export const hydrateCartLineMedia = (lines, products = PRODUCTS) => {
  const mediaByProduct = new Map(
    (Array.isArray(products) ? products : []).map((product) => [
      product.id,
      product,
    ]),
  );

  return (Array.isArray(lines) ? lines : []).map((line) => {
    const product = mediaByProduct.get(line.productId);
    if (!product) return line;
    const legacySize = Object.entries(SIZE_LABELS).find(
      ([, label]) => label && label === line.size,
    )?.[0];

    return {
      ...line,
      image: product.image || line.image || null,
      icon: product.icon || line.icon || 'bag',
      size: legacySize ? getSizeLabelWithWeight(legacySize) : line.size,
    };
  });
};

const getIconName = (icon) => (supportedIcons.has(icon) ? icon : 'bag');

const createProductMedia = ({ image, icon, name }, className) =>
  image
    ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />`
    : `<span class="${className}" aria-hidden="true">
        <svg class="icon"><use href="#cart-i-${getIconName(icon)}"></use></svg>
      </span>`;

const createParameterRows = ({ meat, size, sauce, addons, comment }) => {
  const rows = [
    meat && `Мясо: ${escapeHtml(meat)}`,
    size && `Размер: ${escapeHtml(size)}`,
    sauce && `Соус: ${escapeHtml(sauce)}`,
    addons?.length && `Добавки: ${escapeHtml(addons.join(', '))}`,
    comment && `Комментарий: ${escapeHtml(comment)}`,
  ].filter(Boolean);

  return rows.length
    ? `<p class="cart-line__parameters">${rows
        .map((row) => `<span>${row}</span>`)
        .join('')}</p>`
    : '';
};

export const createCartLineMarkup = (line) => {
  const lineId = escapeHtml(line.lineId);
  const name = escapeHtml(line.name);
  const quantity = Math.max(1, Number(line.quantity) || 1);
  const lineTotal = Math.max(0, Number(line.unitPrice) || 0) * quantity;

  return `
    <article class="cart-line" data-cart-line="${lineId}">
      <div class="cart-line__media">
        ${createProductMedia(line, 'cart-line__placeholder')}
      </div>
      <div class="cart-line__content">
        <div>
          <h2>${name}</h2>
          ${createParameterRows(line)}
        </div>
        <footer class="cart-line__footer">
          <strong>${formatCartPrice(lineTotal)}</strong>
          <div class="cart-quantity" aria-label="Количество товара">
            <button
              type="button"
              aria-label="Уменьшить количество ${name}"
              data-line-id="${lineId}"
              data-line-change="-1"
            >
              <svg class="icon"><use href="#cart-i-minus"></use></svg>
            </button>
            <span aria-live="polite">${quantity}</span>
            <button
              type="button"
              aria-label="Увеличить количество ${name}"
              data-line-id="${lineId}"
              data-line-change="1"
            >
              <svg class="icon"><use href="#cart-i-plus"></use></svg>
            </button>
          </div>
        </footer>
      </div>
    </article>
  `;
};

export const createCartRecommendationMarkup = (product) => `
  <article class="recommendation-card">
    <div class="recommendation-card__media">
      ${createProductMedia(product, 'recommendation-card__placeholder')}
    </div>
    <div class="recommendation-card__body">
      <h3>${escapeHtml(product.name)}</h3>
      <footer>
        <strong>${formatCartPrice(product.price)}</strong>
        <button
          type="button"
          aria-label="Добавить ${escapeHtml(product.name)}"
          data-add-recommendation="${escapeHtml(product.id)}"
        >
          <svg class="icon"><use href="#cart-i-plus"></use></svg>
        </button>
      </footer>
    </div>
  </article>
`;

const getProductById = (productId) =>
  PRODUCTS.find(({ id }) => id === productId);

const initCart = () => {
  const linesRoot = document.querySelector('[data-cart-lines]');
  if (!linesRoot) return;

  const filledCart = document.querySelector('[data-filled-cart]');
  const emptyCart = document.querySelector('[data-empty-cart]');
  const checkoutBar = document.querySelector('[data-checkout-bar]');
  const countLabel = document.querySelector('[data-cart-count-label]');
  const recommendationRoot = document.querySelector('[data-recommendations]');
  const itemsTotal = document.querySelector('[data-items-total]');
  const deliveryTotal = document.querySelector('[data-delivery-total]');
  const grandTotal = document.querySelector('[data-grand-total]');
  const checkoutTotal = document.querySelector('[data-checkout-total]');
  const fulfillmentLabel = document.querySelector('[data-cart-fulfillment]');
  const toast = document.querySelector('[data-cart-toast]');

  const fulfillment = loadFulfillment(window.localStorage);
  if (fulfillmentLabel) {
    fulfillmentLabel.textContent =
      fulfillment === 'delivery' ? 'Доставка' : 'Самовывоз';
  }

  let lines = hydrateCartLineMedia(loadCart(window.localStorage));
  saveCart(window.localStorage, lines);
  let toastTimer;

  const getItemWord = (count) => {
    const remainder100 = count % 100;
    const remainder10 = count % 10;
    if (remainder100 >= 11 && remainder100 <= 14) return 'товаров';
    if (remainder10 === 1) return 'товар';
    if (remainder10 >= 2 && remainder10 <= 4) return 'товара';
    return 'товаров';
  };

  const showToast = (message) => {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 1800);
  };

  const findLineElement = (lineId) =>
    [...linesRoot.querySelectorAll('[data-cart-line]')]
      .find((element) => element.dataset.cartLine === lineId);

  const updateCartSummary = ({ pulseTotals = false } = {}) => {
    const itemCount = getCartItemCount(lines);
    const summary = createCartSummary(lines);
    const isEmpty = itemCount === 0;

    countLabel.textContent = `${itemCount} ${getItemWord(itemCount)}`;
    filledCart.hidden = isEmpty;
    emptyCart.hidden = !isEmpty;
    checkoutBar.hidden = isEmpty;

    itemsTotal.innerHTML = formatCartPrice(summary.items);
    deliveryTotal.innerHTML = formatCartPrice(summary.delivery);
    grandTotal.innerHTML = formatCartPrice(summary.total);
    checkoutTotal.innerHTML = formatCartPrice(summary.total);

    if (pulseTotals) {
      pulseMotion(grandTotal);
      pulseMotion(checkoutTotal);
    }
    if (isEmpty) revealMotion(emptyCart);
  };

  const updateCartLine = (lineId) => {
    const nextLine = lines.find((line) => line.lineId === lineId);
    const currentElement = findLineElement(lineId);

    if (!nextLine) {
      currentElement?.remove();
      return;
    }

    if (currentElement) {
      currentElement.outerHTML = createCartLineMarkup(nextLine);
    } else {
      linesRoot.insertAdjacentHTML('beforeend', createCartLineMarkup(nextLine));
    }

    const nextElement = findLineElement(lineId);
    const quantityNode = nextElement?.querySelector('.cart-quantity span');
    pulseMotion(quantityNode);
    pulseMotion(nextElement?.querySelector('.cart-line__footer strong'));
  };

  const persistCartUpdate = ({ lineId = '', pulseTotals = false } = {}) => {
    saveCart(window.localStorage, lines);
    if (lineId) updateCartLine(lineId);
    updateCartSummary({ pulseTotals });
  };

  const renderInitialCart = () => {
    linesRoot.innerHTML = lines.map(createCartLineMarkup).join('');
    updateCartSummary();
    staggerMotion(linesRoot, '.cart-line');
  };

  const recommendationProducts = CART_RECOMMENDATION_IDS
    .map(getProductById)
    .filter(Boolean);
  recommendationRoot.innerHTML = recommendationProducts
    .map(createCartRecommendationMarkup)
    .join('');
  staggerMotion(recommendationRoot, '.recommendation-card');

  linesRoot.addEventListener('click', (event) => {
    const changeButton = event.target.closest('[data-line-change]');
    if (!changeButton) return;

    const lineId = changeButton.dataset.lineId;
    const change = Number(changeButton.dataset.lineChange);
    const currentLine = lines.find((line) => line.lineId === lineId);
    const removesLine = change < 0 && Number(currentLine?.quantity) <= 1;

    const applyQuantityChange = () => {
      lines = changeCartLineQuantity(
        lines,
        lineId,
        change,
      );
      persistCartUpdate({
        lineId,
        pulseTotals: true,
      });
      if (removesLine) showToast('Товар удалён');
    };

    if (!removesLine) {
      applyQuantityChange();
      return;
    }

    changeButton.closest('[data-cart-line]')?.classList.add('is-removing');
    window.setTimeout(applyQuantityChange, 160);
  });

  recommendationRoot.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-recommendation]');
    if (!button) return;
    const product = getProductById(button.dataset.addRecommendation);
    if (!product) return;

    const addedLine = createCartLine({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      image: product.image,
      icon: product.icon,
    });
    lines = addCartLine(lines, addedLine);
    persistCartUpdate({ lineId: addedLine.lineId, pulseTotals: true });
    pulseMotion(button);
    showToast(`${product.name} добавлен`);
  });

  renderInitialCart();
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCart, { once: true });
  } else {
    initCart();
  }
}
