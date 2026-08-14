import {
  createDemoKitchenApi,
  createKitchenApi,
  isKitchenDemoLocation,
} from './kitchen-api.js?v=2026081409';
import {
  CANCELLATION_REASONS,
  KITCHEN_COLUMNS,
  getNextKitchenAction,
  groupKitchenOrders,
} from './kitchen-model.js?v=2026081409';
import {
  getKitchenItemOptions,
  initKitchenPresentation,
} from './kitchen-presentation.js';
import { PRODUCTS } from './catalog-data.js';
import {
  normalizeKitchenSettings,
  toggleStoppedProduct,
} from './kitchen-settings.js?v=2026081409';
import {
  createStaffLiveSync,
  executeVersionedAction,
} from './staff-live-sync.js?v=2026081409';

const STATUS_LABELS = Object.freeze({
  new: 'Новый',
  accepted: 'Принят',
  cooking: 'Готовится',
  ready: 'Готов',
  issued: 'Выдан',
  handed_to_courier: 'Передан курьеру',
  cancelled: 'Отменён',
  completed: 'Завершён',
});

const FULFILLMENT_LABELS = Object.freeze({
  pickup: 'Самовывоз',
  delivery: 'Доставка',
});

const FILTER_LABELS = Object.freeze({
  pickup: 'Самовывоз',
  delivery: 'Доставка',
  warning: 'Скоро истекает',
  overdue: 'Просроченные',
});

export const escapeKitchenHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const formatKitchenPrice = (value) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(safeAmount)} ₽`;
};

const formatKitchenTime = (value) => {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatKitchenDateTime = (value) => {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const sanitizePhone = (value) => {
  const source = String(value || '').trim();
  const digits = source.replace(/\D/g, '');
  if (!digits) return '';
  return `${source.startsWith('+') ? '+' : ''}${digits}`;
};

const renderOrderItemsCompact = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="order-card__item">Состав не указан</p>';
  }

  return items
    .map((item) => {
      const quantity = Math.max(1, Number(item?.quantity) || 1);
      const options = getKitchenItemOptions(item).join(' · ');
      const optionText = options ? ` — ${options}` : '';
      return `<p class="order-card__item">${escapeKitchenHtml(
        quantity,
      )} × ${escapeKitchenHtml(item?.name || 'Блюдо')}${escapeKitchenHtml(
        optionText,
      )}</p>`;
    })
    .join('');
};

export const createOrderCardMarkup = (order = {}) => {
  const action = getNextKitchenAction(order);
  const urgencyTone = ['normal', 'warning', 'overdue'].includes(
    order?.urgency?.tone,
  )
    ? order.urgency.tone
    : 'normal';
  const orderId = escapeKitchenHtml(order.id);
  const orderNumber = escapeKitchenHtml(order.number || '—');
  const customerName = escapeKitchenHtml(order.customer?.name || 'Гость');
  const fulfillment = escapeKitchenHtml(
    FULFILLMENT_LABELS[order.fulfillment] || 'Самовывоз',
  );
  const urgencyLabel = escapeKitchenHtml(
    order.urgency?.label || 'Без срока',
  );

  return `<article class="order-card" role="listitem" data-order-card data-order-id="${orderId}" data-urgency="${urgencyTone}" data-pending="false">
    <button class="order-card__open" type="button" data-open-order data-order-id="${orderId}" aria-label="Открыть заказ ${orderNumber}">
      <span class="order-card__heading">
        <strong>#${orderNumber}</strong>
        <time datetime="${escapeKitchenHtml(order.createdAt)}">${escapeKitchenHtml(
          formatKitchenTime(order.createdAt),
        )}</time>
      </span>
      <span class="order-card__customer">${customerName}</span>
      <span class="order-card__meta">
        <span>${fulfillment}</span>
        <span class="urgency-label" data-tone="${urgencyTone}">${urgencyLabel}</span>
      </span>
      <span class="order-card__items">${renderOrderItemsCompact(order.items)}</span>
    </button>
    <footer class="order-card__footer">
      <span><b class="order-card__total">${escapeKitchenHtml(
        formatKitchenPrice(order.total),
      )}</b><small class="order-card__paid">Оплачено</small></span>
      ${
        action
          ? `<button class="order-card__action" type="button" data-change-status data-order-id="${orderId}" data-next-status="${escapeKitchenHtml(
              action.status,
            )}">${escapeKitchenHtml(action.label)}</button>`
          : order.status === 'ready' && order.fulfillment === 'delivery'
            ? '<span class="order-card__waiting">Ожидает курьера</span>'
            : ''
      }
    </footer>
  </article>`;
};

const renderDetailItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p>Состав заказа не указан.</p>';
  }

  return items
    .map((item) => {
      const quantity = Math.max(1, Number(item?.quantity) || 1);
      const options = getKitchenItemOptions(item);
      const optionMarkup = options.length
        ? `<p>${options.map(escapeKitchenHtml).join(' · ')}</p>`
        : '';
      const commentMarkup = item?.comment
        ? `<p class="detail-comment">${escapeKitchenHtml(item.comment)}</p>`
        : '';
      return `<article class="detail-item">
        <strong>${escapeKitchenHtml(quantity)} × ${escapeKitchenHtml(
          item?.name || 'Блюдо',
        )}</strong>
        ${optionMarkup}
        ${commentMarkup}
      </article>`;
    })
    .join('');
};

const renderStatusHistory = (history) => {
  if (!Array.isArray(history) || history.length === 0) {
    return '<p>Заказ ещё не менял статус.</p>';
  }

  return history
    .slice()
    .reverse()
    .map(
      (entry) => `<article class="history-entry">
        <time datetime="${escapeKitchenHtml(entry?.at)}">${escapeKitchenHtml(
          formatKitchenTime(entry?.at),
        )}</time>
        <p><strong>${escapeKitchenHtml(
          STATUS_LABELS[entry?.to] || entry?.to || 'Изменение',
        )}</strong><br />${escapeKitchenHtml(
          entry?.employee || 'Сотрудник',
        )}${
          entry?.reason
            ? `<br /><span>${escapeKitchenHtml(entry.reason)}</span>`
            : ''
        }</p>
      </article>`,
    )
    .join('');
};

const renderAddress = (address) => {
  if (!address || typeof address !== 'object' || !address.street) return '';
  const details = [
    address.entrance ? `подъезд ${address.entrance}` : '',
    address.floor ? `этаж ${address.floor}` : '',
    address.apartment ? `кв. ${address.apartment}` : '',
    address.intercom ? `домофон ${address.intercom}` : '',
  ].filter(Boolean);
  return `<section class="detail-section">
    <h3>Адрес доставки</h3>
    <p>${escapeKitchenHtml(address.street)}</p>
    ${details.length ? `<p>${escapeKitchenHtml(details.join(' · '))}</p>` : ''}
  </section>`;
};

export const createOrderDetailsMarkup = (order = {}) => {
  const action = getNextKitchenAction(order);
  const canCancel = ['new', 'accepted', 'cooking', 'ready'].includes(
    order.status,
  );
  const phone = String(order.customer?.phone || '');
  const phoneHref = sanitizePhone(phone);
  const customerName = order.customer?.name || 'Гость';
  const status = STATUS_LABELS[order.status] || order.status || '—';
  const fulfillment =
    FULFILLMENT_LABELS[order.fulfillment] || 'Самовывоз';

  return `<section class="detail-section">
      <dl class="detail-grid">
        <dt>Статус</dt><dd>${escapeKitchenHtml(status)}</dd>
        <dt>Получение</dt><dd>${escapeKitchenHtml(fulfillment)}</dd>
        <dt>Создан</dt><dd>${escapeKitchenHtml(
          formatKitchenDateTime(order.createdAt),
        )}</dd>
        <dt>Ожидание</dt><dd>${escapeKitchenHtml(
          order.urgency?.label || 'Без срока',
        )}</dd>
        <dt>Оплата</dt><dd>Оплачено онлайн</dd>
        <dt>Итого</dt><dd>${escapeKitchenHtml(
          formatKitchenPrice(order.total),
        )}</dd>
      </dl>
    </section>
    <section class="detail-section">
      <h3>Состав заказа</h3>
      ${renderDetailItems(order.items)}
      ${
        order.comment
          ? `<p class="detail-comment">Комментарий: ${escapeKitchenHtml(
              order.comment,
            )}</p>`
          : ''
      }
    </section>
    <section class="detail-section">
      <h3>Клиент</h3>
      <p><strong>${escapeKitchenHtml(customerName)}</strong></p>
      ${
        phoneHref
          ? `<a href="tel:${escapeKitchenHtml(phoneHref)}">${escapeKitchenHtml(
              phone,
            )}</a>`
          : '<p>Телефон не указан</p>'
      }
    </section>
    ${order.fulfillment === 'delivery' ? renderAddress(order.address) : ''}
    <section class="detail-section">
      <h3>История статусов</h3>
      <div class="history-list">${renderStatusHistory(order.history)}</div>
    </section>
    <footer class="detail-actions">
      ${
        action
          ? `<button class="button button--primary" type="button" data-change-status data-order-id="${escapeKitchenHtml(
              order.id,
            )}" data-next-status="${escapeKitchenHtml(
              action.status,
            )}">${escapeKitchenHtml(action.label)}</button>`
          : order.status === 'ready' && order.fulfillment === 'delivery'
            ? '<p class="detail-actions__waiting">Заказ готов и ожидает курьера</p>'
            : ''
      }
      ${
        canCancel
          ? `<button class="button button--secondary" type="button" data-open-cancel data-order-id="${escapeKitchenHtml(
              order.id,
            )}">Отменить заказ</button>`
          : ''
      }
    </footer>`;
};

export const createHistoryMarkup = (orders) => {
  if (!Array.isArray(orders) || orders.length === 0) {
    return '<div class="board-empty"><p><strong>История пока пуста</strong><br />Завершённые и отменённые заказы появятся здесь.</p></div>';
  }

  return orders
    .map((order) => {
      const status = STATUS_LABELS[order?.status] || order?.status || '—';
      return `<article class="history-order" data-history-order data-order-id="${escapeKitchenHtml(
        order?.id,
      )}">
        <strong>#${escapeKitchenHtml(order?.number || '—')}</strong>
        <span><b>${escapeKitchenHtml(status)}</b><br /><small>${escapeKitchenHtml(
          FULFILLMENT_LABELS[order?.fulfillment] || 'Самовывоз',
        )}</small></span>
        <span>${escapeKitchenHtml(order?.employee || '—')}</span>
        <b>${escapeKitchenHtml(formatKitchenPrice(order?.total))}</b>
      </article>`;
    })
    .join('');
};

export const createOperationId = (
  orderId,
  action,
  randomSource = globalThis.crypto,
) => {
  const suffix =
    typeof randomSource?.randomUUID === 'function'
      ? randomSource.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `kitchen:${String(orderId)}:${String(action)}:${suffix}`;
};

export const validateCancellationInput = ({
  reasonId,
  comment,
  confirmation,
  orderNumber,
} = {}) => {
  const reason = CANCELLATION_REASONS.find((item) => item.id === reasonId);
  if (!reason) return 'Выберите причину отмены';
  if (reasonId === 'other' && String(comment || '').trim().length < 3) {
    return 'Опишите причину отмены';
  }
  if (String(confirmation || '').trim() !== String(orderNumber || '').trim()) {
    return 'Введите точный номер заказа';
  }
  return '';
};

export const createNewOrderNotifier = ({
  playSound = () => {},
  announce = () => {},
  isMuted = () => false,
} = {}) => {
  const seenOrderIds = new Set();
  return {
    markSeen(orderIds) {
      for (const orderId of orderIds || []) seenOrderIds.add(String(orderId));
    },
    notify(order) {
      const orderId = String(order?.id || '');
      if (!orderId || order?.status !== 'new' || seenOrderIds.has(orderId)) {
        return false;
      }
      seenOrderIds.add(orderId);
      announce(`Новый заказ №${String(order?.number || '')}`);
      if (!isMuted()) playSound();
      return true;
    },
    reset() {
      seenOrderIds.clear();
    },
  };
};

export const getConnectionPresentation = (connected, label = '') => {
  if (label) {
    return {
      label,
      state: 'syncing',
      showOfflineBanner: false,
    };
  }
  return connected
    ? { label: 'В сети', state: 'online', showOfflineBanner: false }
    : { label: 'Нет соединения', state: 'offline', showOfflineBanner: true };
};

const setElementHidden = (element, hidden) => {
  if (element) element.hidden = hidden;
};

export const initKitchen = async ({ windowRef, documentRef, api } = {}) => {
  if (!windowRef || !documentRef) return null;

  const hostname = windowRef.location?.hostname || '';
  const activeApi =
    api ||
    (isKitchenDemoLocation(windowRef.location)
      ? createDemoKitchenApi()
      : createKitchenApi());
  const root = documentRef.querySelector('[data-kitchen-app]');
  if (!root) return null;

  const refs = {
    loginView: root.querySelector('[data-login-view]'),
    boardView: root.querySelector('[data-board-view]'),
    pinForm: root.querySelector('[data-pin-form]'),
    pinInput: root.querySelector('[name="pin"]'),
    pinError: root.querySelector('[data-pin-error]'),
    employee: root.querySelector('[data-employee]'),
    employeeInitials: root.querySelector('[data-employee-initials]'),
    shift: root.querySelector('[data-shift]'),
    switchEmployee: root.querySelector('[data-switch-employee]'),
    currentTime: root.querySelector('[data-current-time]'),
    connection: root.querySelector('[data-connection]'),
    offlineBanner: root.querySelector('[data-offline-banner]'),
    board: root.querySelector('[data-board]'),
    search: root.querySelector('[data-search]'),
    filtersButton: root.querySelector('[data-filters]'),
    filterCount: root.querySelector('[data-filter-count]'),
    filterDialog: root.querySelector('[data-filter-dialog]'),
    filterForm: root.querySelector('[data-filter-form]'),
    filterReset: root.querySelector('[data-filter-reset]'),
    filterChips: root.querySelector('[data-filter-chips]'),
    mobileColumns: root.querySelector('[data-mobile-columns]'),
    historyOpen: root.querySelector('[data-history-open]'),
    historyClose: root.querySelector('[data-history-close]'),
    historyView: root.querySelector('[data-history-view]'),
    historyList: root.querySelector('[data-history-list]'),
    panel: root.querySelector('[data-order-panel]'),
    panelTitle: root.querySelector('#order-panel-title'),
    panelContent: root.querySelector('[data-order-panel-content]'),
    panelClose: root.querySelector('[data-order-panel-close]'),
    panelScrim: root.querySelector('[data-panel-scrim]'),
    soundToggle: root.querySelector('[data-sound-toggle]'),
    settingsOpen: root.querySelector('[data-kitchen-settings-open]'),
    settingsDialog: root.querySelector('[data-kitchen-settings-dialog]'),
    settingsForm: root.querySelector('[data-kitchen-settings-form]'),
    settingsClose: root.querySelectorAll('[data-kitchen-settings-close]'),
    settingsSave: root.querySelector('[data-kitchen-settings-save]'),
    acceptingOrders: root.querySelector('[data-accepting-orders]'),
    stopList: root.querySelector('[data-stop-list]'),
    cancelDialog: root.querySelector('[data-cancel-dialog]'),
    cancelForm: root.querySelector('[data-cancel-form]'),
    cancelWarning: root.querySelector('[data-cancel-warning]'),
    cancelNumber: root.querySelector('[data-cancel-number]'),
    cancelError: root.querySelector('[data-cancel-error]'),
    confirmCancel: root.querySelector('[data-confirm-cancel]'),
    toast: root.querySelector('[data-toast]'),
  };

  const state = {
    session: null,
    orders: [],
    historyOrders: [],
    mode: 'board',
    selectedOrderId: '',
    query: '',
    fulfillment: 'all',
    urgency: 'all',
    activeMobileColumn: 'new',
    connected: false,
    soundMuted: false,
    settings: normalizeKitchenSettings(),
    settingsPending: false,
    cancellingOrderId: '',
    pendingOperations: new Set(),
    failedOperations: new Map(),
  };
  let liveSync = null;
  let lastPanelTrigger = null;
  let audioContext = null;
  let audioUnlocked = false;

  const showToast = (message, tone = 'normal', action = null) => {
    if (!refs.toast) return;
    const toast = documentRef.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;
    const copy = documentRef.createElement('span');
    copy.textContent = message;
    toast.append(copy);
    if (action?.label && typeof action.onClick === 'function') {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        toast.remove();
        action.onClick();
      });
      toast.append(button);
    }
    refs.toast.append(toast);
    windowRef.setTimeout(() => toast.remove(), action ? 7000 : 3200);
  };

  const updateConnection = (connected, label = '') => {
    state.connected = Boolean(connected);
    const presentation = getConnectionPresentation(connected, label);
    if (refs.connection) {
      refs.connection.textContent = presentation.label;
      refs.connection.dataset.connected = String(Boolean(connected));
      refs.connection.dataset.state = presentation.state;
    }
    setElementHidden(refs.offlineBanner, !presentation.showOfflineBanner);
  };

  const unlockAudio = () => {
    if (audioUnlocked) return;
    const AudioContextClass =
      windowRef.AudioContext || windowRef.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    void audioContext.resume?.();
    audioUnlocked = true;
  };

  const playNewOrderSound = () => {
    if (!audioUnlocked || !audioContext || state.soundMuted) return;
    const startAt = audioContext.currentTime;
    [740, 880].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteAt = startAt + index * 0.09;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteAt);
      gain.gain.setValueAtTime(0.0001, noteAt);
      gain.gain.exponentialRampToValueAtTime(0.11, noteAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteAt + 0.075);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteAt);
      oscillator.stop(noteAt + 0.08);
    });
  };

  const newOrderNotifier = createNewOrderNotifier({
    playSound: playNewOrderSound,
    announce: (message) => showToast(message),
    isMuted: () => state.soundMuted,
  });

  const renderKitchenSettings = () => {
    const normalized = normalizeKitchenSettings(state.settings);
    state.settings = normalized;
    if (refs.acceptingOrders) {
      refs.acceptingOrders.checked = normalized.acceptingOrders;
      refs.acceptingOrders.disabled = state.settingsPending;
    }
    if (refs.settingsSave) refs.settingsSave.disabled = state.settingsPending;
    if (!refs.stopList) return;

    const stopped = new Set(normalized.stoppedProductIds);
    refs.stopList.innerHTML = PRODUCTS.map(
      (product) => `<label class="stop-list__item">
        <span>
          <strong>${escapeKitchenHtml(product.name)}</strong>
          <small>${escapeKitchenHtml(product.description)}</small>
        </span>
        <input type="checkbox" data-stop-product="${escapeKitchenHtml(product.id)}" ${
          stopped.has(product.id) ? 'checked' : ''
        } ${state.settingsPending ? 'disabled' : ''} />
      </label>`,
    ).join('');
  };

  const loadKitchenSettings = async () => {
    const response = await activeApi.getSettings();
    state.settings = normalizeKitchenSettings(response);
    renderKitchenSettings();
  };

  const openKitchenSettings = async () => {
    if (!refs.settingsDialog || state.settingsPending) return;
    state.settingsPending = true;
    renderKitchenSettings();
    try {
      await loadKitchenSettings();
      refs.settingsDialog.showModal();
    } catch (error) {
      showToast(error?.message || 'Не удалось загрузить настройки', 'error');
    } finally {
      state.settingsPending = false;
      renderKitchenSettings();
    }
  };

  const updateClock = () => {
    if (!refs.currentTime) return;
    const now = new Date();
    refs.currentTime.dateTime = now.toISOString();
    refs.currentTime.textContent = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
  };

  const getGroupedOrders = () =>
    groupKitchenOrders(state.orders, {
      query: state.query,
      fulfillment: state.fulfillment,
      urgency: state.urgency,
      nowMs: Date.now(),
    });

  const findVisibleOrder = (orderId) => {
    const groups = getGroupedOrders();
    return Object.values(groups)
      .flat()
      .find((order) => order.id === orderId);
  };

  const renderFilterChips = () => {
    const filters = [
      ['fulfillment', state.fulfillment],
      ['urgency', state.urgency],
    ].filter(([, value]) => value !== 'all');
    if (!refs.filterChips) return;
    refs.filterChips.innerHTML = filters
      .map(
        ([key, value]) => `<button class="filter-chip" type="button" data-clear-filter="${escapeKitchenHtml(
          key,
        )}">${escapeKitchenHtml(FILTER_LABELS[value] || value)} <span aria-hidden="true">×</span></button>`,
      )
      .join('');
    setElementHidden(refs.filterChips, filters.length === 0);
    if (refs.filterCount) {
      refs.filterCount.textContent = String(filters.length);
      setElementHidden(refs.filterCount, filters.length === 0);
    }
  };

  const renderBoard = () => {
    if (!refs.board) return;
    const scrollPositions = new Map();
    refs.board.querySelectorAll('[data-column]').forEach((column) => {
      const list = column.querySelector('[data-column-list]');
      scrollPositions.set(column.dataset.column, list?.scrollTop || 0);
    });

    const groups = getGroupedOrders();
    const totalVisible = Object.values(groups).reduce(
      (sum, orders) => sum + orders.length,
      0,
    );

    KITCHEN_COLUMNS.forEach((definition, index) => {
      const column = refs.board.querySelector(
        `[data-column="${definition.id}"]`,
      );
      if (!column) return;
      const list = column.querySelector('[data-column-list]');
      const count = column.querySelector('[data-column-count]');
      const orders = groups[definition.id] || [];
      column.classList.toggle(
        'is-current',
        definition.id === state.activeMobileColumn,
      );
      if (count) count.textContent = String(orders.length);
      const mobileButton = refs.mobileColumns?.querySelector(
        `[data-mobile-column="${definition.id}"]`,
      );
      if (mobileButton) {
        const active = definition.id === state.activeMobileColumn;
        mobileButton.classList.toggle('is-active', active);
        mobileButton.setAttribute('aria-pressed', String(active));
        const mobileCount = mobileButton.querySelector('[data-mobile-column-count]');
        if (mobileCount) mobileCount.textContent = String(orders.length);
      }
      if (list) {
        list.innerHTML = orders.length
          ? orders.map(createOrderCardMarkup).join('')
          : `<div class="${
              totalVisible === 0 && index === 0 ? 'board-empty' : 'column-empty'
            }"><p><strong>${
              totalVisible === 0 && index === 0
                ? 'Все заказы выполнены'
                : 'Нет заказов'
            }</strong></p></div>`;
        list.querySelectorAll('[data-order-card]').forEach((card) => {
          const pending = state.pendingOperations.has(card.dataset.orderId);
          card.dataset.pending = String(pending);
          if (pending) {
            const action = card.querySelector('[data-change-status]');
            if (action) {
              action.disabled = true;
              action.textContent = 'Сохраняем…';
            }
          }
        });
        list.scrollTop = scrollPositions.get(definition.id) || 0;
      }
    });

    renderFilterChips();
    if (state.selectedOrderId) renderPanel();
  };

  const renderPanel = () => {
    if (!state.selectedOrderId || !refs.panel || !refs.panelContent) return;
    const order =
      findVisibleOrder(state.selectedOrderId) ||
      state.historyOrders.find((item) => item.id === state.selectedOrderId);
    if (!order) {
      closePanel();
      return;
    }
    if (refs.panelTitle) {
      refs.panelTitle.textContent = `Заказ #${order.number || '—'}`;
    }
    refs.panelContent.innerHTML = createOrderDetailsMarkup(order);
    if (state.pendingOperations.has(order.id)) {
      refs.panelContent.querySelectorAll('[data-change-status], [data-open-cancel]')
        .forEach((button) => {
          button.disabled = true;
          if (button.matches('[data-change-status]')) {
            button.textContent = 'Сохраняем…';
          }
        });
    }
  };

  const openPanel = (orderId, trigger) => {
    state.selectedOrderId = String(orderId || '');
    lastPanelTrigger = trigger || documentRef.activeElement;
    renderPanel();
    setElementHidden(refs.panelScrim, false);
    setElementHidden(refs.panel, false);
    refs.panelClose?.focus();
  };

  function closePanel() {
    state.selectedOrderId = '';
    setElementHidden(refs.panel, true);
    setElementHidden(refs.panelScrim, true);
    if (lastPanelTrigger?.isConnected) lastPanelTrigger.focus();
    lastPanelTrigger = null;
  }

  const renderHistory = () => {
    if (refs.historyList) {
      refs.historyList.innerHTML = createHistoryMarkup(state.historyOrders);
    }
  };

  const showBoardMode = () => {
    state.mode = 'board';
    setElementHidden(refs.board, false);
    setElementHidden(refs.historyView, true);
    renderBoard();
  };

  const showHistoryMode = async () => {
    state.mode = 'history';
    setElementHidden(refs.board, true);
    setElementHidden(refs.historyView, false);
    if (refs.historyList) {
      refs.historyList.innerHTML =
        '<div class="board-empty"><p>Загружаем историю…</p></div>';
    }
    try {
      const response = await activeApi.getHistory({ query: state.query });
      state.historyOrders = Array.isArray(response?.orders)
        ? response.orders
        : [];
      renderHistory();
    } catch (error) {
      showToast(error?.message || 'Не удалось загрузить историю', 'error');
      if (refs.historyList) {
        refs.historyList.innerHTML =
          '<div class="board-empty"><p>История временно недоступна.</p></div>';
      }
    }
  };

  const animateMovedCard = (orderId) => {
    const card = refs.board?.querySelector(
      `[data-order-card][data-order-id="${String(orderId).replaceAll('"', '\\"')}"]`,
    );
    card?.animate?.(
      [
        { opacity: 0.35, transform: 'translateY(-6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 160, easing: 'ease-out' },
    );
  };

  const replaceOrderFromServer = (order, { animate = false } = {}) => {
    if (!order?.id) return;
    const index = state.orders.findIndex((item) => item.id === order.id);
    if (['cancelled', 'issued', 'handed_to_courier'].includes(order.status)) {
      if (index >= 0) state.orders.splice(index, 1);
    } else if (index >= 0) {
      state.orders[index] = order;
    } else {
      state.orders.push(order);
    }
    if (state.mode === 'board') {
      renderBoard();
      if (animate) animateMovedCard(order.id);
    }
  };

  const replaceOrderFromEvent = (event) => {
    if (event?.type === 'sync.required') {
      void Promise.all([
        liveSync?.sync() || loadBoard(),
        event.sourceType === 'settings.updated'
          ? loadKitchenSettings()
          : Promise.resolve(),
      ]);
      return;
    }
    if (event?.type === 'settings.updated') {
      state.settings = normalizeKitchenSettings(event.settings);
      renderKitchenSettings();
      return;
    }
    const order = event?.order;
    const wasKnown = state.orders.some((item) => item.id === order?.id);
    replaceOrderFromServer(order, { animate: wasKnown });
    if (!wasKnown) newOrderNotifier.notify(order);
  };

  const loadBoard = async ({ seedSounds = false } = {}) => {
    const knownIds = new Set(state.orders.map((order) => order.id));
    const response = await activeApi.getBoard();
    state.orders = Array.isArray(response?.orders) ? response.orders : [];
    if (seedSounds) {
      newOrderNotifier.markSeen(state.orders.map((order) => order.id));
    } else {
      state.orders
        .filter((order) => !knownIds.has(order.id))
        .forEach((order) => newOrderNotifier.notify(order));
    }
    renderBoard();
    updateConnection(true);
    return state.orders;
  };

  const handleConnectionChange = async (connected) => {
    if (!connected) {
      updateConnection(false);
      return;
    }
    updateConnection(false, 'Синхронизация…');
    try {
      await (liveSync?.sync() || loadBoard());
    } catch {
      updateConnection(false);
      showToast('Не удалось синхронизировать заказы', 'error');
    }
  };

  const handleWindowOffline = () => {
    if (state.session) updateConnection(false);
  };

  const handleWindowOnline = () => {
    if (state.session) void handleConnectionChange(true);
  };

  const activateSession = async (response) => {
    state.session = response;
    if (refs.employee) refs.employee.textContent = response.employee?.name || '';
    if (refs.employeeInitials) {
      refs.employeeInitials.textContent = String(response.employee?.name || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    if (refs.shift) refs.shift.textContent = `Смена ${response.shift || 'активна'}`;
    setElementHidden(refs.loginView, true);
    setElementHidden(refs.boardView, false);
    await Promise.all([
      loadBoard({ seedSounds: true }),
      loadKitchenSettings(),
    ]);
    liveSync?.stop();
    liveSync = createStaffLiveSync({
      refresh: () => loadBoard(),
      subscribe: (...args) => activeApi.subscribe(...args),
      setIntervalFn: (...args) => windowRef.setInterval(...args),
      clearIntervalFn: (timer) => windowRef.clearInterval(timer),
      isVisible: () => documentRef.visibilityState !== 'hidden',
    });
    liveSync.start(
      replaceOrderFromEvent,
      (connected) => void handleConnectionChange(connected),
    );
  };

  const startSession = async (pin) => {
    const response = await activeApi.login(pin);
    await activateSession(response);
  };

  const endSession = async () => {
    liveSync?.stop();
    liveSync = null;
    closePanel();
    try {
      await activeApi.logout();
    } catch {
      // A local sign-out must still clear the sensitive in-memory session.
    }
    state.session = null;
    state.orders = [];
    state.historyOrders = [];
    state.query = '';
    state.fulfillment = 'all';
    state.urgency = 'all';
    state.settings = normalizeKitchenSettings();
    state.settingsPending = false;
    state.cancellingOrderId = '';
    state.pendingOperations.clear();
    state.failedOperations.clear();
    newOrderNotifier.reset();
    updateConnection(false);
    if (refs.search) refs.search.value = '';
    setElementHidden(refs.boardView, true);
    setElementHidden(refs.loginView, false);
    refs.pinInput?.focus();
  };

  const performStatusChange = async (
    orderId,
    nextStatus,
    operationId = createOperationId(orderId, nextStatus, windowRef.crypto),
  ) => {
    if (!state.connected) {
      showToast('Нет соединения. Статус не изменён', 'error');
      return;
    }
    if (state.pendingOperations.has(orderId)) return;
    const currentOrder = state.orders.find((order) => order.id === orderId);
    if (getNextKitchenAction(currentOrder)?.status !== nextStatus) {
      showToast('Этот переход статуса недоступен', 'error');
      return;
    }

    state.pendingOperations.add(orderId);
    state.failedOperations.delete(orderId);
    renderBoard();
    if (state.selectedOrderId === orderId) renderPanel();

    try {
      let attempt = 0;
      const result = await executeVersionedAction({
        entityId: orderId,
        initialVersion: currentOrder.version || 1,
        execute: (version) =>
          activeApi.changeStatus(
            orderId,
            nextStatus,
            version,
            attempt++ === 0
              ? operationId
              : createOperationId(orderId, nextStatus, windowRef.crypto),
          ),
        refresh: () => loadBoard(),
        canRetry: (order) =>
          getNextKitchenAction(order)?.status === nextStatus,
      });
      if (result?.alreadyChanged) {
        showToast('Заказ уже обновлён на другом устройстве');
        return;
      }
      replaceOrderFromServer(result?.order, { animate: true });
      if (['issued', 'handed_to_courier'].includes(result?.order?.status)) {
        closePanel();
      }
      showToast('Статус сохранён');
    } catch (error) {
      if (error?.status === 401) {
        showToast('Сессия закончилась. Войдите снова', 'error');
        await endSession();
        return;
      }
      state.failedOperations.set(orderId, {
        type: 'status',
        orderId,
        nextStatus,
        operationId,
      });
      showToast(error?.message || 'Статус не сохранён', 'error', {
        label: 'Повторить',
        onClick: () =>
          void performStatusChange(orderId, nextStatus, operationId),
      });
    } finally {
      state.pendingOperations.delete(orderId);
      if (state.mode === 'board') renderBoard();
      if (state.selectedOrderId === orderId) renderPanel();
    }
  };

  const openCancellation = (orderId) => {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order || !refs.cancelDialog || !refs.cancelForm) return;
    state.cancellingOrderId = orderId;
    refs.cancelForm.reset();
    if (refs.cancelNumber) refs.cancelNumber.textContent = `#${order.number}`;
    if (refs.confirmCancel) {
      refs.confirmCancel.textContent = `Отменить заказ #${order.number}`;
      refs.confirmCancel.disabled = false;
    }
    if (refs.cancelWarning) {
      refs.cancelWarning.textContent = ['cooking', 'ready'].includes(order.status)
        ? 'Заказ уже готовится или готов. После отмены будет запущен возврат оплаты.'
        : 'Заказ будет убран с рабочей доски. Оплата будет возвращена клиенту.';
    }
    if (refs.cancelError) {
      refs.cancelError.textContent = '';
      refs.cancelError.hidden = true;
    }
    refs.cancelDialog.showModal();
  };

  const performCancellation = async ({
    order,
    reasonId,
    comment,
    operationId,
  }) => {
    if (!state.connected) {
      throw new Error('Нет соединения. Заказ не отменён');
    }
    state.pendingOperations.add(order.id);
    if (refs.confirmCancel) {
      refs.confirmCancel.disabled = true;
      refs.confirmCancel.textContent = 'Отменяем…';
    }
    renderBoard();

    try {
      const result = await activeApi.cancelOrder(
        order.id,
        { reasonId, comment },
        order.version || 1,
        operationId,
      );
      if (result?.order) {
        replaceOrderFromServer(result.order, { animate: true });
        state.historyOrders.unshift(result.order);
      } else {
        state.orders = state.orders.filter((item) => item.id !== order.id);
        renderBoard();
      }
      refs.cancelDialog?.close();
      closePanel();
      const refundMessage =
        result?.refundStatus === 'succeeded'
          ? 'Деньги возвращены'
          : result?.refundStatus === 'failed'
            ? 'Не удалось оформить возврат'
            : 'Возврат обрабатывается';
      showToast(`Заказ #${order.number} отменён. ${refundMessage}`);
    } finally {
      state.pendingOperations.delete(order.id);
      state.cancellingOrderId = '';
      if (refs.confirmCancel) refs.confirmCancel.disabled = false;
      if (state.mode === 'board') renderBoard();
    }
  };

  const handleOrderInteraction = (event) => {
    const statusButton = event.target.closest('[data-change-status]');
    if (statusButton) {
      void performStatusChange(
        statusButton.dataset.orderId,
        statusButton.dataset.nextStatus,
      );
      return;
    }
    const cancelButton = event.target.closest('[data-open-cancel]');
    if (cancelButton) {
      openCancellation(cancelButton.dataset.orderId);
      return;
    }
    const trigger = event.target.closest('[data-open-order]');
    if (trigger) openPanel(trigger.dataset.orderId, trigger);
  };

  refs.pinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pin = refs.pinInput?.value || '';
    if (refs.pinInput) refs.pinInput.value = '';
    if (refs.pinError) {
      refs.pinError.textContent = '';
      refs.pinError.hidden = true;
    }
    const submit = refs.pinForm.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await startSession(pin);
    } catch (error) {
      if (refs.pinError) {
        refs.pinError.textContent = error?.message || 'Не удалось войти';
        refs.pinError.hidden = false;
      }
      refs.pinInput?.focus();
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  refs.switchEmployee?.addEventListener('click', () => void endSession());
  refs.settingsOpen?.addEventListener('click', () => void openKitchenSettings());
  refs.settingsClose?.forEach((button) => {
    button.addEventListener('click', () => refs.settingsDialog?.close());
  });
  refs.acceptingOrders?.addEventListener('change', () => {
    state.settings = normalizeKitchenSettings({
      ...state.settings,
      acceptingOrders: refs.acceptingOrders.checked,
    });
    renderKitchenSettings();
  });
  refs.stopList?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-stop-product]');
    if (!input) return;
    state.settings = toggleStoppedProduct(
      state.settings,
      input.dataset.stopProduct,
    );
    renderKitchenSettings();
  });
  refs.settingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.settingsPending) return;
    if (!state.connected) {
      showToast('Нет соединения. Настройки не сохранены', 'error');
      return;
    }
    state.settingsPending = true;
    renderKitchenSettings();
    try {
      const result = await activeApi.updateSettings(
        state.settings,
        createOperationId('settings', 'update', windowRef.crypto),
      );
      state.settings = normalizeKitchenSettings(result);
      refs.settingsDialog?.close();
      showToast('Настройки кухни сохранены');
    } catch (error) {
      if (error?.status === 401) {
        showToast('Сессия закончилась. Войдите снова', 'error');
        await endSession();
        return;
      }
      showToast(error?.message || 'Настройки не сохранены', 'error');
    } finally {
      state.settingsPending = false;
      renderKitchenSettings();
    }
  });
  refs.search?.addEventListener('input', () => {
    state.query = refs.search.value.trim();
    if (state.mode === 'board') renderBoard();
  });
  refs.filtersButton?.addEventListener('click', () => {
    refs.filterDialog?.showModal();
  });
  refs.filterForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const FormDataClass = windowRef.FormData;
    const data = new FormDataClass(refs.filterForm);
    state.fulfillment = String(data.get('fulfillment') || 'all');
    state.urgency = String(data.get('urgency') || 'all');
    refs.filterDialog?.close();
    renderBoard();
  });
  refs.filterReset?.addEventListener('click', () => {
    windowRef.setTimeout(() => {
      state.fulfillment = 'all';
      state.urgency = 'all';
      renderBoard();
    }, 0);
  });
  refs.filterChips?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-clear-filter]');
    if (!button) return;
    const key = button.dataset.clearFilter;
    if (key === 'fulfillment' || key === 'urgency') state[key] = 'all';
    const input = refs.filterForm?.querySelector(`[name="${key}"][value="all"]`);
    if (input) input.checked = true;
    renderBoard();
  });
  refs.mobileColumns?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mobile-column]');
    if (!button) return;
    const columnId = button.dataset.mobileColumn;
    if (!KITCHEN_COLUMNS.some(({ id }) => id === columnId)) return;
    state.activeMobileColumn = columnId;
    renderBoard();
  });
  refs.historyOpen?.addEventListener('click', () => void showHistoryMode());
  refs.historyClose?.addEventListener('click', showBoardMode);
  refs.board?.addEventListener('click', handleOrderInteraction);
  refs.panelContent?.addEventListener('click', handleOrderInteraction);
  refs.historyList?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-history-order]');
    if (trigger) openPanel(trigger.dataset.orderId, trigger);
  });
  refs.soundToggle?.addEventListener('click', () => {
    unlockAudio();
    state.soundMuted = !state.soundMuted;
    refs.soundToggle.setAttribute('aria-pressed', String(!state.soundMuted));
    refs.soundToggle.setAttribute(
      'aria-label',
      state.soundMuted ? 'Включить звук' : 'Выключить звук',
    );
    showToast(state.soundMuted ? 'Звук выключен' : 'Звук включён');
  });
  refs.cancelForm?.addEventListener('submit', async (event) => {
    if (event.submitter?.value !== 'confirm') {
      state.cancellingOrderId = '';
      return;
    }
    event.preventDefault();
    const order = state.orders.find(
      (item) => item.id === state.cancellingOrderId,
    );
    if (!order) {
      refs.cancelDialog?.close();
      return;
    }
    const data = new windowRef.FormData(refs.cancelForm);
    const values = {
      reasonId: String(data.get('cancelReason') || ''),
      comment: String(data.get('cancelComment') || '').trim(),
      confirmation: String(data.get('cancelConfirmation') || '').trim(),
      orderNumber: String(order.number || ''),
    };
    const validationError = validateCancellationInput(values);
    if (validationError) {
      if (refs.cancelError) {
        refs.cancelError.textContent = validationError;
        refs.cancelError.hidden = false;
      }
      return;
    }
    if (refs.cancelError) refs.cancelError.hidden = true;
    const operationId = createOperationId(
      order.id,
      'cancel',
      windowRef.crypto,
    );
    try {
      await performCancellation({
        order,
        reasonId: values.reasonId,
        comment: values.comment,
        operationId,
      });
    } catch (error) {
      if (refs.cancelError) {
        refs.cancelError.textContent = error?.message || 'Заказ не отменён';
        refs.cancelError.hidden = false;
      }
      if (refs.confirmCancel) {
        refs.confirmCancel.disabled = false;
        refs.confirmCancel.textContent = `Отменить заказ #${order.number}`;
      }
    }
  });
  refs.panelClose?.addEventListener('click', closePanel);
  refs.panelScrim?.addEventListener('click', closePanel);
  documentRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !refs.panel?.hidden) closePanel();
  });

  updateClock();
  const clockTimer = windowRef.setInterval(updateClock, 30000);
  documentRef.addEventListener('pointerdown', unlockAudio, { once: true });
  windowRef.addEventListener('offline', handleWindowOffline);
  windowRef.addEventListener('online', handleWindowOnline);
  const handleVisibilityChange = () => {
    if (state.session && documentRef.visibilityState !== 'hidden') {
      void liveSync?.sync();
    }
  };
  documentRef.addEventListener('visibilitychange', handleVisibilityChange);
  setElementHidden(refs.loginView, false);
  setElementHidden(refs.boardView, true);
  try {
    const restoredSession = await activeApi.getSession?.();
    if (restoredSession) {
      await activateSession(restoredSession);
    } else {
      refs.pinInput?.focus();
    }
  } catch {
    refs.pinInput?.focus();
  }

  if (
    'serviceWorker' in windowRef.navigator &&
    (windowRef.isSecureContext || hostname === 'localhost')
  ) {
    windowRef.navigator.serviceWorker.register('./kitchen-sw.js?v=2026081409').catch(() => {});
  }

  return {
    state,
    renderBoard,
    openPanel,
    closePanel,
    destroy() {
      liveSync?.stop();
      windowRef.clearInterval(clockTimer);
      windowRef.removeEventListener('offline', handleWindowOffline);
      windowRef.removeEventListener('online', handleWindowOnline);
      documentRef.removeEventListener('visibilitychange', handleVisibilityChange);
    },
  };
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initKitchenPresentation({ windowRef: window, documentRef: document });
  void initKitchen({ windowRef: window, documentRef: document });
}
