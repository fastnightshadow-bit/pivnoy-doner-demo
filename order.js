import { saveCart } from './cart-storage.js';
import { pulseMotion, revealMotion } from './motion.js';
import {
  getOrderPresentation,
  getOrderProgress,
  normalizeOrderStatus,
} from './order-state.js';
import {
  loadActiveOrder,
  subscribeToActiveOrder,
} from './order-storage.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatPrice = (value) =>
  `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')}\u00a0₽`;

const createCheckIcon = () => `
  <svg class="order-icon" aria-hidden="true">
    <use href="#order-i-check"></use>
  </svg>
`;

export const getTechnicalStatus = (search = '') => {
  const value = new URLSearchParams(String(search)).get('state') || '';
  return normalizeOrderStatus(value) === value ? value : '';
};

export const createProgressMarkup = (order = {}) => {
  const { activeIndex, labels } = getOrderProgress(order);

  return labels
    .map((label, index) => {
      const state =
        index < activeIndex
          ? 'complete'
          : index === activeIndex
            ? 'current'
            : 'future';
      const current = state === 'current' ? ' aria-current="step"' : '';
      const completeClass = state === 'complete' ? ' is-complete' : '';

      return `
        <li
          class="order-progress__step${completeClass}"
          data-state="${state}"${current}
        >
          <span class="order-progress__dot" aria-hidden="true">
            ${state === 'complete' ? createCheckIcon() : ''}
          </span>
          <span>${escapeHtml(label)}</span>
        </li>
      `;
    })
    .join('');
};

const getItemParameters = (item = {}) =>
  [
    item.meat,
    item.size,
    ...(Array.isArray(item.addons) ? item.addons : []),
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ');

export const createOrderItemsMarkup = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const parameters = getItemParameters(item);

      return `
        <article class="order-item">
          <div>
            <h3>${escapeHtml(item.name || 'Блюдо')}</h3>
            ${parameters ? `<p>${escapeHtml(parameters)}</p>` : ''}
            ${
              item.comment
                ? `<p>Комментарий: ${escapeHtml(item.comment)}</p>`
                : ''
            }
          </div>
          <strong>${quantity} × ${formatPrice(item.unitPrice)}</strong>
        </article>
      `;
    })
    .join('');

const formatAddress = (address = {}) =>
  [
    address.street,
    address.entrance && `подъезд ${address.entrance}`,
    address.floor && `этаж ${address.floor}`,
    address.apartment && `кв. ${address.apartment}`,
    address.intercom && `домофон ${address.intercom}`,
  ]
    .filter(Boolean)
    .join(', ');

const createContextMarkup = (order) => {
  if (order.fulfillment === 'delivery') {
    const address = formatAddress(order.address);
    return `
      <div class="order-context__icon" aria-hidden="true">
        <svg class="order-icon"><use href="#order-i-location"></use></svg>
      </div>
      <div>
        <span>Адрес доставки</span>
        <strong>${escapeHtml(address || 'Адрес уточняется')}</strong>
        ${
          order.comment
            ? `<p>${escapeHtml(order.comment)}</p>`
            : ''
        }
      </div>
    `;
  }

  return `
    <div class="order-context__icon" aria-hidden="true">
      <svg class="order-icon"><use href="#order-i-location"></use></svg>
    </div>
    <div>
      <span>Самовывоз</span>
      <strong>Москва, Волоколамское шоссе, 71/22к2</strong>
      <a
        class="order-context__route"
        href="https://yandex.ru/maps/org/pivnoy_doner_promkooperatsiya/21845327554/"
        target="_blank"
        rel="noreferrer"
        data-order-route
      >Открыть маршрут</a>
    </div>
  `;
};

const createSummaryMarkup = (order) => `
  <dt>Позиций</dt>
  <dd>${order.items.reduce(
    (total, item) => total + Math.max(1, Number(item.quantity) || 1),
    0,
  )}</dd>
  ${
    order.discount
      ? `<dt>Скидка</dt><dd>−${formatPrice(order.discount)}</dd>`
      : ''
  }
  <dt>Оплата</dt>
  <dd>${order.payment === 'sbp' ? 'СБП' : 'Карта'}</dd>
  <dt>Итого</dt>
  <dd>${formatPrice(order.total)}</dd>
`;

const getRefs = (root) => ({
  screen: root.querySelector('[data-order-screen]'),
  empty: root.querySelector('[data-order-empty]'),
  number: root.querySelector('[data-order-number]'),
  title: root.querySelector('[data-order-title]'),
  message: root.querySelector('[data-order-message]'),
  eta: root.querySelector('[data-order-eta]'),
  progress: root.querySelector('[data-order-progress]'),
  detailsToggle: root.querySelector('[data-order-details-toggle]'),
  details: root.querySelector('[data-order-details]'),
  items: root.querySelector('[data-order-items]'),
  summary: root.querySelector('[data-order-summary]'),
  context: root.querySelector('[data-order-context]'),
  actions: root.querySelector('[data-order-actions]'),
  contact: root.querySelector('[data-order-contact]'),
  retry: root.querySelector('[data-order-retry]'),
  confirmation: root.querySelector('.order-confirmation'),
  statusIcon: root.querySelector('[data-order-status-icon]'),
});

const applyTechnicalStatus = (order, search) => {
  const status = getTechnicalStatus(search);
  return status ? { ...order, status } : order;
};

export const renderOrder = (
  order,
  {
    root = globalThis.document,
    search = globalThis.location?.search || '',
  } = {},
) => {
  if (!root?.querySelector) return null;
  const refs = getRefs(root);

  if (!order) {
    refs.screen.hidden = true;
    refs.actions.hidden = true;
    refs.empty.hidden = false;
    return null;
  }

  const visibleOrder = applyTechnicalStatus(order, search);
  const presentation = getOrderPresentation(visibleOrder);
  const failed = visibleOrder.status === 'payment-failed';

  refs.empty.hidden = true;
  refs.screen.hidden = false;
  refs.actions.hidden = false;
  refs.number.textContent = `№ ${visibleOrder.number}`;
  refs.title.textContent = presentation.title;
  refs.message.textContent = presentation.message;
  refs.eta.textContent = presentation.eta || '';
  refs.eta.hidden = !presentation.eta;
  refs.progress.innerHTML = createProgressMarkup(visibleOrder);
  refs.items.innerHTML = createOrderItemsMarkup(visibleOrder.items);
  refs.summary.innerHTML = createSummaryMarkup(visibleOrder);
  refs.context.innerHTML = createContextMarkup(visibleOrder);
  refs.confirmation.dataset.orderTone = presentation.tone;
  refs.statusIcon?.setAttribute(
    'href',
    failed ? '#order-i-alert' : '#order-i-check',
  );

  refs.contact.hidden = !visibleOrder.restaurantPhone || failed;
  if (visibleOrder.restaurantPhone) {
    refs.contact.href = `tel:${visibleOrder.restaurantPhone.replace(
      /[^\d+]/g,
      '',
    )}`;
  }

  refs.retry.hidden = !failed;
  root.querySelectorAll('[data-order-home]').forEach((link) => {
    if (link.closest('.order-actions')) link.hidden = failed;
  });

  if (failed) {
    refs.retry.href = `checkout.html?retry=${encodeURIComponent(
      visibleOrder.id,
    )}`;
  }

  return visibleOrder;
};

const initOrder = () => {
  const root = document;
  const refs = getRefs(root);
  if (!refs.screen) return;

  let currentOrder = loadActiveOrder(window.localStorage);

  const update = (order, { animate = false } = {}) => {
    currentOrder = renderOrder(order, {
      root,
      search: window.location.search,
    });
    if (animate && currentOrder) pulseMotion(refs.title);
  };

  refs.detailsToggle.addEventListener('click', () => {
    const expanded =
      refs.detailsToggle.getAttribute('aria-expanded') !== 'true';
    refs.detailsToggle.setAttribute('aria-expanded', String(expanded));
    refs.details.hidden = !expanded;
    if (expanded) revealMotion(refs.details);
  });

  refs.retry.addEventListener('click', () => {
    if (!currentOrder) return;
    saveCart(window.localStorage, currentOrder.items);
    refs.retry.href = `checkout.html?retry=${encodeURIComponent(
      currentOrder.id,
    )}`;
  });

  const unsubscribe = subscribeToActiveOrder(window, (order) => {
    update(order, { animate: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      update(loadActiveOrder(window.localStorage), { animate: true });
    }
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });

  update(currentOrder);
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrder, { once: true });
  } else {
    initOrder();
  }
}
