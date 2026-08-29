import { CATEGORIES, PRODUCTS } from './catalog-data.js';
import {
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
  SIZE_LABELS,
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  getProductConfiguration,
  getProductDescription,
} from './product-config.js';
import { calculateCartSummary, getCartItemCount } from './cart-state.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (value) => `${new Intl.NumberFormat('ru-RU').format(Number(value) || 0)} ₽`;

const backIcon = `
  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <path d="m15 5-7 7 7 7" />
  </svg>`;
const plusGlyph = '<span class="kiosk-plus-glyph" aria-hidden="true"></span>';
const minusGlyph = '<span class="kiosk-minus-glyph" aria-hidden="true"></span>';
const closeIcon = '<span class="kiosk-close-glyph" aria-hidden="true"></span>';

const brand = `
  <img
    class="kiosk-brand"
    src="assets/mobile-home/brand-wordmark.webp"
    alt="Пивной Донер"
    width="244"
    height="92"
  />`;

const cartIcon = `
  <svg class="kiosk-cart-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <path d="M5.5 8.5h13l-1.1 9.2H6.6L5.5 8.5Z" />
    <path d="M9 8.5v-1a3 3 0 0 1 6 0v1" />
  </svg>`;

export const getKioskAvailability = (product, selection = {}, settings = {}) => {
  if (!product) return { available: false, reason: 'Блюдо не найдено' };
  if (settings.acceptingOrders === false) return { available: false, reason: 'Приём заказов приостановлен' };
  if ((settings.stoppedProductIds || []).includes(product.id)) return { available: false, reason: 'Временно нет в наличии' };
  if (selection.meat && (settings.stoppedMeatIds || []).includes(selection.meat)) {
    return { available: false, reason: `${MEAT_LABELS[selection.meat] || 'Выбранное мясо'} временно недоступна` };
  }
  if (selection.sauce && (settings.stoppedSauceIds || []).includes(selection.sauce)) return { available: false, reason: 'Выбранный соус временно недоступен' };
  const stoppedAddon = (selection.addons || []).find((id) => (settings.stoppedAddonIds || []).includes(id));
  if (stoppedAddon) return { available: false, reason: 'Одна из добавок временно недоступна' };
  return { available: true, reason: '' };
};

const renderStart = (context) => `
  <section class="kiosk-screen kiosk-start" aria-labelledby="kiosk-start-title">
    <div class="kiosk-start__copy">
      ${brand}
      <p class="kiosk-eyebrow">Готовим сочно. Подаём быстро.</p>
      <h1 id="kiosk-start-title">Вкус, который<br />хочется <span>повторить</span></h1>
      <p class="kiosk-lead">Соберите свой заказ за пару касаний</p>
      <button class="kiosk-primary kiosk-touch" type="button" data-kiosk-start>
        Начать заказ
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>
      </button>
    </div>
    <div class="kiosk-start__visual" aria-hidden="true"><img src="assets/mobile-home/desktop-hero.webp" alt="" /></div>
    <div class="kiosk-start__status" aria-label="Статус стойки">
      <span class="kiosk-status-dot${context.connected === false ? ' is-offline' : ''}"></span>
      ${context.settings?.acceptingOrders === false ? 'Приём заказов приостановлен' : 'Стойка готова к заказу'}
    </div>
  </section>`;

const renderFulfillment = () => `
  <section class="kiosk-screen kiosk-choice" aria-labelledby="kiosk-choice-title">
    <header class="kiosk-topbar">
      <button class="kiosk-icon-button kiosk-touch" type="button" data-kiosk-back aria-label="Назад">${backIcon}</button>
      ${brand}<span class="kiosk-topbar__spacer" aria-hidden="true"></span>
    </header>
    <div class="kiosk-choice__content">
      <p class="kiosk-eyebrow">Шаг 1 из 3</p><h1 id="kiosk-choice-title">Где будете есть?</h1>
      <p class="kiosk-lead">Вы сможете изменить выбор в корзине</p>
      <div class="kiosk-choice__grid">
        <button class="kiosk-choice-card kiosk-touch" type="button" data-kiosk-fulfillment="dine-in">
          <span class="kiosk-choice-card__icon" aria-hidden="true"><svg class="kiosk-choice-illustration is-dine-in" viewBox="0 0 64 64"><path fill="#171717" d="M9 48h46a4 4 0 0 1-4 5H13a4 4 0 0 1-4-5Z"/><path fill="#ef2722" d="M14 44c1.4-13.8 8.5-22.1 18-22.1S48.6 30.2 50 44H14Z"/><path fill="#fff" d="M20 40c2-8 6.3-12.1 12-12.1 5.8 0 10 4.1 12 12H20Z" opacity=".22"/><path fill="#171717" d="M28.5 17.5a3.5 3.5 0 1 1 7 0V22h-7v-4.5Z"/></svg></span>
          <strong>Здесь</strong><small>Подадим заказ в ресторане</small>
        </button>
        <button class="kiosk-choice-card kiosk-touch" type="button" data-kiosk-fulfillment="takeaway">
          <span class="kiosk-choice-card__icon" aria-hidden="true"><svg class="kiosk-choice-illustration is-takeaway" viewBox="0 0 64 64"><path fill="#171717" d="M15 19h34l-3.2 35H18.2L15 19Z"/><path fill="#ef2722" d="M19 23h26l-2.5 27h-21L19 23Z"/><path fill="#fff" d="M24 16a8 8 0 0 1 16 0v7h-5v-7a3 3 0 0 0-6 0v7h-5v-7Z"/><path fill="#fff" d="M24 29h16v4H24z" opacity=".85"/></svg></span>
          <strong>С собой</strong><small>Надёжно упакуем заказ</small>
        </button>
      </div>
    </div>
  </section>`;

const renderCategoryTabs = (activeCategory) => `
  <nav class="kiosk-categories" aria-label="Категории меню">
    ${CATEGORIES.map((category) => `
      <button type="button" class="kiosk-category kiosk-touch${category.id === activeCategory ? ' is-active' : ''}"
        data-kiosk-category="${category.id}"><span class="kiosk-category__label">${escapeHtml(category.label)}</span></button>`).join('')}
  </nav>`;

const renderProductCard = (product, settings) => {
  const meat = getAvailableMeats(product.id).find((id) => !(settings.stoppedMeatIds || []).includes(id)) || getAvailableMeats(product.id)[0];
  const selection = { meat, size: getAvailableSizes(product.id, meat)[0] };
  const availability = getKioskAvailability(product, selection, settings);
  return `
    <button class="kiosk-product kiosk-touch${availability.available ? '' : ' is-disabled'}" type="button"
      data-kiosk-product="${product.id}" ${availability.available ? '' : 'disabled'}>
      <span class="kiosk-product__visual${product.category === 'shawarma' ? ' is-shawarma' : ''}">
        ${product.badge ? `<b>${escapeHtml(product.badge)}</b>` : ''}
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" />
      </span>
      <span class="kiosk-product__body">
        <strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.description)}</small>
        <span class="kiosk-product__bottom"><b>${product.pricePrefix ? `${product.pricePrefix} ` : ''}${money(product.price)}</b><i aria-hidden="true">${plusGlyph}</i></span>
        ${availability.available ? '' : `<em>${escapeHtml(availability.reason)}</em>`}
      </span>
    </button>`;
};

const renderCartBar = (state) => {
  const count = getCartItemCount(state.lines);
  const total = calculateCartSummary(state.lines).total;
  return `
    <button class="kiosk-cart-bar kiosk-touch${count ? ' has-items' : ''}" type="button" data-kiosk-cart ${count ? '' : 'disabled'}>
      <span>${cartIcon}<b>Корзина</b>${count ? `<i>${count}</i>` : ''}</span><strong>${count ? money(total) : 'Пока пусто'}</strong>
    </button>`;
};

const renderCatalog = (state, context) => {
  const category = context.activeCategory || 'shawarma';
  const products = (context.products?.length ? context.products : PRODUCTS).filter((product) => product.category === category);
  return `
    <section class="kiosk-screen kiosk-catalog" aria-labelledby="kiosk-catalog-title">
      <header class="kiosk-menu-header">${brand}<span>${state.fulfillment === 'dine-in' ? 'Здесь' : 'С собой'}</span></header>
      ${renderCategoryTabs(category)}
      <main class="kiosk-menu-content">
        <p class="kiosk-eyebrow">Меню</p><h1 id="kiosk-catalog-title">${escapeHtml(CATEGORIES.find(({ id }) => id === category)?.label || 'Блюда')}</h1>
        ${products.length ? `<div class="kiosk-products">${products.map((product) => renderProductCard(product, context.settings || {})).join('')}</div>` : `<div class="kiosk-empty-category"><strong>Скоро появится</strong><span>Мы уже готовим новинки для этой категории</span></div>`}
      </main>${renderCartBar(state)}
    </section>`;
};

const renderSegment = (name, values, selected, labels, settings, type) => `
  <fieldset class="kiosk-option-group" data-kiosk-option="${type}">
    <legend>${name}</legend>
    <div>${values.map((value) => {
      const stopped = type === 'meat' ? (settings.stoppedMeatIds || []).includes(value) : false;
      return `<button type="button" class="kiosk-option kiosk-touch${selected === value ? ' is-selected' : ''}"
        data-kiosk-set-${type}="${value}" ${stopped ? 'disabled' : ''}>${escapeHtml(labels[value] || value)}${stopped ? '<small>Нет</small>' : ''}</button>`;
    }).join('')}</div>
  </fieldset>`;

const renderProduct = (state, context) => {
  const product = (context.products?.length ? context.products : PRODUCTS).find(({ id }) => id === state.selectedProductId);
  if (!product) return renderCatalog({ ...state, screen: 'catalog' }, context);
  const config = getProductConfiguration(product.id);
  const selection = context.selection || {};
  const meats = getAvailableMeats(product.id);
  const meat = selection.meat || meats[0] || 'default';
  const sizes = getAvailableSizes(product.id, meat);
  const size = selection.size || sizes[0] || 'single';
  const sauce = selection.sauce ?? '';
  const addons = selection.addons || [];
  const quantity = Math.max(1, Number(selection.quantity) || 1);
  const normalized = { meat, size, sauce, addons };
  const availability = getKioskAvailability(product, normalized, context.settings || {});
  const unitPrice = calculateProductPrice(product.id, normalized);
  return `
    <section class="kiosk-screen kiosk-catalog" aria-label="Меню">
      <div class="kiosk-product-backdrop" data-kiosk-close-product></div>
      <article class="kiosk-product-sheet${context.animateProductEntry ? ' is-entering' : ''}" aria-labelledby="kiosk-product-title">
        <button class="kiosk-sheet-close kiosk-touch" type="button" data-kiosk-close-product aria-label="Закрыть">${closeIcon}</button>
        <div class="kiosk-sheet-hero"><span class="kiosk-sheet-image-stage"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" decoding="sync" /></span></div>
        <div class="kiosk-sheet-content">
          <h1 id="kiosk-product-title">${escapeHtml(product.name)}</h1><p>${escapeHtml(getProductDescription(product, meat))}</p>
          ${meats.length > 1 ? renderSegment('Выберите мясо', meats, meat, MEAT_LABELS, context.settings || {}, 'meat') : ''}
          ${sizes.length > 1 ? renderSegment('Выберите размер', sizes, size, SIZE_LABELS, context.settings || {}, 'size') : ''}
          ${config.addons.length ? `
            <fieldset class="kiosk-option-group" data-kiosk-option="addons"><legend>Добавки</legend>
              <div class="kiosk-addon-grid">${config.addons.map((id) => {
                const item = PRODUCT_ADDONS[id];
                const stopped = (context.settings?.stoppedAddonIds || []).includes(id);
                return `<button type="button" class="kiosk-addon kiosk-touch${addons.includes(id) ? ' is-selected' : ''}" data-kiosk-toggle-addon="${id}" ${stopped ? 'disabled' : ''}>
                  <span>${escapeHtml(item.label)}<small>+${money(item.price)}</small></span><b>${addons.includes(id) ? '<span class="kiosk-check-glyph" aria-hidden="true">✓</span>' : plusGlyph}</b>
                </button>`;
              }).join('')}</div>
            </fieldset>` : ''}
          ${config.sauces?.length ? `
            <fieldset class="kiosk-option-group"><legend>Соус <small>по желанию · +50 ₽</small></legend>
              <div class="kiosk-sauce-row">
                <button type="button" class="kiosk-option kiosk-touch${sauce ? '' : ' is-selected'}" data-kiosk-set-sauce="">Без соуса</button>
                ${config.sauces.map((id) => {
                const stopped = (context.settings?.stoppedSauceIds || []).includes(id);
                return `<button type="button" class="kiosk-option kiosk-touch${sauce === id ? ' is-selected' : ''}" data-kiosk-set-sauce="${id}" ${stopped ? 'disabled' : ''}>${escapeHtml(PRODUCT_SAUCES[id]?.label || id)} <small>+50 ₽</small></button>`;
              }).join('')}</div>
            </fieldset>` : ''}
        </div>
        <footer class="kiosk-sheet-footer">
          <div class="kiosk-quantity"><button type="button" data-kiosk-product-quantity="-1" aria-label="Уменьшить">${minusGlyph}</button><strong>${quantity}</strong><button type="button" data-kiosk-product-quantity="1" aria-label="Увеличить">${plusGlyph}</button></div>
          <button class="kiosk-primary kiosk-touch" type="button" data-kiosk-add-line ${availability.available ? '' : 'disabled'}>${availability.available ? `${context.editingLineId ? 'Сохранить' : 'Добавить'} · ${money(unitPrice * quantity)}` : escapeHtml(availability.reason)}</button>
        </footer>
      </article>
    </section>`;
};

export const renderKiosk = (state, context = {}) => {
  if (state.screen === 'start') return renderStart(context);
  if (state.screen === 'fulfillment') return renderFulfillment();
  if (state.screen === 'catalog') return renderCatalog(state, context);
  if (state.screen === 'product') return renderProduct(state, context);
  return renderCatalog({ ...state, screen: 'catalog' }, context);
};
