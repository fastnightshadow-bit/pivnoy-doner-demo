import { PRODUCTS } from './catalog-data.js';
import { calculateCartSummary } from './cart-state.js';
import {
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
  SIZE_LABELS,
} from './product-config.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = (value) => `${new Intl.NumberFormat('ru-RU').format(Number(value) || 0)} ₽`;
const backIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></svg>';
const cartIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h2l2.3 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H7m3 11h.01M17 19h.01" /></svg>';
const brand = '<img class="kiosk-brand" src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" width="244" height="92" />';

const renderRecommendation = (product) => `
  <button class="kiosk-cart-rec kiosk-touch" type="button" data-kiosk-product="${product.id}">
    <img src="${escapeHtml(product.image)}" alt="" loading="lazy" />
    <span><strong>${escapeHtml(product.name)}</strong><b>${money(product.price)}</b></span><i>+</i>
  </button>`;

export const renderKioskCart = (state, context = {}) => {
  const summary = calculateCartSummary(state.lines);
  const addonLabel = (id) => PRODUCT_ADDONS[id]?.label || id;
  const sauceLabel = (id) => PRODUCT_SAUCES[id]?.label || id;
  const products = context.products?.length ? context.products : PRODUCTS;
  return `
    <section class="kiosk-screen kiosk-cart" aria-labelledby="kiosk-cart-title">
      <header class="kiosk-cart-header">
        <button class="kiosk-icon-button kiosk-touch" type="button" data-kiosk-back aria-label="Назад">${backIcon}</button>
        <div><p class="kiosk-eyebrow">Ваш заказ</p><h1 id="kiosk-cart-title">Корзина</h1></div>${brand}
      </header>
      <main class="kiosk-cart-content">
        ${state.lines.length ? `<div class="kiosk-cart-lines">${state.lines.map((line) => `
          <article class="kiosk-cart-line">
            <img src="${escapeHtml(line.image || '')}" alt="" />
            <div class="kiosk-cart-line__copy"><h2>${escapeHtml(line.name)}</h2>
              <p>${[MEAT_LABELS[line.meat], SIZE_LABELS[line.size], line.sauce ? `Соус: ${sauceLabel(line.sauce)}` : '', ...(line.addons || []).map(addonLabel)].filter(Boolean).map(escapeHtml).join(' · ')}</p>
              <strong>${money(line.unitPrice * line.quantity)}</strong>
            </div>
            <div class="kiosk-line-quantity" data-kiosk-line-quantity>
              <button type="button" data-kiosk-change-line="${line.lineId}" data-delta="-1" aria-label="Уменьшить">−</button><b>${line.quantity}</b><button type="button" data-kiosk-change-line="${line.lineId}" data-delta="1" aria-label="Увеличить">+</button>
            </div>
          </article>`).join('')}</div>` : `<div class="kiosk-cart-empty">${cartIcon}<h2>Корзина пока пуста</h2><p>Вернитесь в меню и выберите любимые блюда</p></div>`}
        <section class="kiosk-cart-recommendations"><p class="kiosk-eyebrow">Можно добавить</p><h2>Попробуйте вместе</h2><div>${products.filter(({ category }) => category === 'snacks').slice(0, 4).map(renderRecommendation).join('')}</div></section>
      </main>
      <footer class="kiosk-cart-checkout">
        <div><span>${state.fulfillment === 'dine-in' ? 'Здесь' : 'С собой'}</span><small>Итого</small><strong>${money(summary.total)}</strong></div>
        <button class="kiosk-primary kiosk-touch" type="button" data-kiosk-checkout ${state.lines.length ? '' : 'disabled'}>Перейти к оплате</button>
      </footer>
    </section>`;
};
