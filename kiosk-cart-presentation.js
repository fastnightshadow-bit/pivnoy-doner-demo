import { PRODUCTS } from './catalog-data.js?v=2026090101';
import { calculateCartSummary } from './cart-state.js';
import {
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
  SIZE_LABELS,
} from './product-config.js?v=2026090101';
import { formatOptionQuantities } from './option-quantities.js';
import { getKioskAvailability } from './kiosk-availability.js?v=2026090101';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = (value) => `${new Intl.NumberFormat('ru-RU').format(Number(value) || 0)} ₽`;
const backIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></svg>';
const plusGlyph = '<span class="kiosk-plus-glyph" aria-hidden="true"></span>';
const minusGlyph = '<span class="kiosk-minus-glyph" aria-hidden="true"></span>';
const cartIcon = `<svg class="kiosk-cart-empty__icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
  <path d="M5.5 8.5h13l-1.1 9.2H6.6L5.5 8.5Z" />
  <path d="M9 8.5v-1a3 3 0 0 1 6 0v1" />
</svg>`;
const brand = '<img class="kiosk-brand" src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" width="244" height="92" />';

const renderRecommendation = (product) => `
  <button class="kiosk-cart-rec kiosk-touch" type="button" data-kiosk-product="${product.id}">
    <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" />
    <span><strong>${escapeHtml(product.name)}</strong><b>${money(product.price)}</b></span><i aria-hidden="true">${plusGlyph}</i>
  </button>`;

const optionLabels = (value, labels) =>
  formatOptionQuantities(value).map((entry) => {
    const [id, quantity] = entry.split(' ×');
    const label = labels[id]?.label || id;
    return quantity ? `${label} ×${quantity}` : label;
  });

export const renderKioskCart = (state, context = {}) => {
  const summary = calculateCartSummary(state.lines);
  const products = context.products?.length ? context.products : PRODUCTS;
  return `
    <section class="kiosk-screen kiosk-cart" aria-labelledby="kiosk-cart-title">
      <header class="kiosk-cart-header">
        <button class="kiosk-icon-button kiosk-touch" type="button" data-kiosk-back aria-label="Назад">${backIcon}</button>
        <div><p class="kiosk-eyebrow">Ваш заказ</p><h1 id="kiosk-cart-title">Корзина</h1></div>${brand}
      </header>
      <main class="kiosk-cart-content">
        ${context.notice ? `<p class="kiosk-cart-notice" role="status">${escapeHtml(context.notice)}</p>` : ''}
        ${state.lines.length ? `<div class="kiosk-cart-lines">${state.lines.map((line) => `
          <article class="kiosk-cart-line kiosk-touch" data-kiosk-edit-line="${escapeHtml(line.lineId)}" role="button" tabindex="0" aria-label="Изменить ${escapeHtml(line.name)}">
            ${line.image ? `<img src="${escapeHtml(line.image)}" alt="${escapeHtml(line.name)}" decoding="async" />` : '<span class="kiosk-cart-line__placeholder" aria-hidden="true">•</span>'}
            <div class="kiosk-cart-line__copy"><h2>${escapeHtml(line.name)}</h2>
              <p>${[
                MEAT_LABELS[line.meat],
                SIZE_LABELS[line.size],
                ...optionLabels(line.addons, PRODUCT_ADDONS),
                ...optionLabels(line.sauces, PRODUCT_SAUCES).map((label) => `Соус: ${label}`),
              ].filter(Boolean).map(escapeHtml).join(' · ')}</p>
              <strong>${money(line.unitPrice * line.quantity)}</strong>
            </div>
            <div class="kiosk-line-quantity" data-kiosk-line-quantity>
              <button type="button" data-kiosk-change-line="${line.lineId}" data-delta="-1" aria-label="Уменьшить">${minusGlyph}</button><b>${line.quantity}</b><button type="button" data-kiosk-change-line="${line.lineId}" data-delta="1" aria-label="Увеличить">${plusGlyph}</button>
            </div>
          </article>`).join('')}</div>` : `<div class="kiosk-cart-empty">${cartIcon}<h2>Корзина пока пуста</h2><p>Вернитесь в меню и выберите любимые блюда</p></div>`}
        <section class="kiosk-cart-recommendations"><p class="kiosk-eyebrow">Можно добавить</p><h2>Попробуйте вместе</h2><div>${products
          .filter(({ category }) => category === 'snacks')
          .filter((product) => getKioskAvailability(product, {}, context.settings || {}).available)
          .slice(0, 4)
          .map(renderRecommendation).join('')}</div></section>
      </main>
      <footer class="kiosk-cart-checkout">
        <div><span>${state.fulfillment === 'dine-in' ? 'Здесь' : 'С собой'}</span><small>Итого</small><strong>${money(summary.total)}</strong></div>
        <button class="kiosk-primary kiosk-touch" type="button" data-kiosk-checkout ${state.lines.length ? '' : 'disabled'}>Перейти к оплате</button>
      </footer>
    </section>`;
};
