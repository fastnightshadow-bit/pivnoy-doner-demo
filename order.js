import { saveCart } from './cart-storage.js';
import { pulseMotion, revealMotion } from './motion.js';
import {
  getOrderPresentation,
  getOrderProgress,
  normalizeOrderStatus,
} from './order-state.js';
import {
  loadActiveOrder,
  saveActiveOrder,
  subscribeToActiveOrder,
} from './order-storage.js';
import { createReviewService } from './review-service.js';
import { isReviewableOrder } from './review-state.js';
import { formatOptionQuantities } from './option-quantities.js';
import {
  canUseReviewDemo,
  ensureReviewDemoOrder,
} from './order-demo.js';

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

export const createRatingButtonsMarkup = (selectedRating = 0) =>
  [1, 2, 3, 4, 5]
    .map(
      (rating) => `
        <button
          class="order-review__star"
          type="button"
          aria-label="Оценка ${rating} из 5"
          data-review-rating="${rating}"
          aria-pressed="${rating <= selectedRating}"
        >★</button>
      `,
    )
    .join('');

export const isLocalReviewDemoHost = (hostname = '') =>
  canUseReviewDemo({ hostname });

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

const getItemParameters = (item = {}) => {
  const sauces = formatOptionQuantities(
    item.sauces ?? (item.sauce ? { [item.sauce]: 1 } : {}),
  );
  const addons = formatOptionQuantities(item.addons);

  return [
    item.meat,
    item.size,
    sauces.length &&
      `${sauces.length === 1 ? 'Соус' : 'Соусы'}: ${sauces.join(', ')}`,
    ...addons,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ');
};

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
  review: root.querySelector('[data-order-review]'),
  reviewForm: root.querySelector('[data-review-form]'),
  reviewStars: root.querySelector('[data-review-stars]'),
  reviewComment: root.querySelector('[data-review-comment]'),
  reviewSubmit: root.querySelector('[data-review-submit]'),
  reviewSuccess: root.querySelector('[data-review-success]'),
  reviewError: root.querySelector('[data-review-error]'),
  demoComplete: root.querySelector('[data-demo-complete-order]'),
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
  if (refs.review) refs.review.hidden = !isReviewableOrder(visibleOrder);
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

  let currentOrder = ensureReviewDemoOrder({
    storage: window.localStorage,
    hostname: window.location.hostname,
    search: window.location.search,
  });
  const reviewService = createReviewService({ storage: window.localStorage });
  let selectedRating = 0;

  const renderRating = (rating = 0) => {
    selectedRating = rating;
    refs.reviewStars.innerHTML = createRatingButtonsMarkup(rating);
    refs.reviewSubmit.disabled = rating === 0;
  };

  const showReviewSuccess = (shown) => {
    refs.reviewForm.hidden = shown;
    refs.reviewSuccess.hidden = !shown;
    refs.reviewError.hidden = true;
  };

  const syncReview = async (order) => {
    if (!order || !isReviewableOrder(order)) return;
    const existing = await reviewService.findByOrderId(order.id);
    if (currentOrder?.id !== order.id) return;
    showReviewSuccess(Boolean(existing));
    if (!existing) renderRating(selectedRating);
  };

  const update = (order, { animate = false } = {}) => {
    currentOrder = renderOrder(order, {
      root,
      search: window.location.search,
    });
    if (refs.demoComplete) {
      refs.demoComplete.hidden =
        !currentOrder ||
        isReviewableOrder(currentOrder) ||
        !canUseReviewDemo({
          hostname: window.location.hostname,
          search: window.location.search,
        });
    }
    if (animate && currentOrder) pulseMotion(refs.title);
    void syncReview(currentOrder);
  };

  refs.demoComplete?.addEventListener('click', () => {
    if (
      !currentOrder ||
      isReviewableOrder(currentOrder) ||
      !canUseReviewDemo({
        hostname: window.location.hostname,
        search: window.location.search,
      })
    ) {
      return;
    }

    const completedOrder = saveActiveOrder(window.localStorage, {
      ...currentOrder,
      status: 'completed',
    });
    update(completedOrder, { animate: true });
    refs.review?.scrollIntoView({ block: 'start' });
  });

  refs.reviewStars.addEventListener('click', (event) => {
    const button = event.target.closest('[data-review-rating]');
    if (!button) return;
    renderRating(Number(button.dataset.reviewRating));
    pulseMotion(button);
  });

  refs.reviewForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentOrder || !selectedRating) return;

    refs.reviewSubmit.disabled = true;
    refs.reviewError.hidden = true;
    try {
      await reviewService.submit({
        orderId: currentOrder.id,
        rating: selectedRating,
        authorName: currentOrder.customerName,
        comment: refs.reviewComment.value,
      });
      showReviewSuccess(true);
      revealMotion(refs.reviewSuccess);
    } catch (error) {
      if (String(error?.message).includes('already-reviewed')) {
        showReviewSuccess(true);
        return;
      }
      refs.reviewError.textContent =
        'Не удалось отправить отзыв. Попробуйте ещё раз.';
      refs.reviewError.hidden = false;
      refs.reviewSubmit.disabled = false;
      revealMotion(refs.reviewError);
    }
  });

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
