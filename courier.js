import {
  createCourierApi,
  createDemoCourierApi,
  isCourierDemoLocation,
} from './courier-api.js?v=2026082202';
import {
  applyCourierActionResult,
  filterCourierOrders,
  formatCourierAddress,
  getCourierAction,
  getCourierReadyLabel,
  getCourierStatusLabel,
  sanitizeCourierPhone,
} from './courier-state.js?v=2026082202';
import {
  createStaffLiveSync,
  executeVersionedAction,
} from './staff-live-sync.js?v=2026082202';
import {
  createCourierPushManager,
  getCourierPushViewModel,
} from './courier-push.js?v=2026082202';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const createCourierOrderMarkup = (order, now = new Date()) => {
  const phone = sanitizeCourierPhone(order.phone);
  const status = getCourierStatusLabel(order.status);
  const action = getCourierAction(order);
  return `
    <article class="courier-order" data-courier-order="${escapeHtml(order.id)}">
      <header class="courier-order__top">
        <strong>Заказ #${escapeHtml(order.number)}</strong>
        <span class="courier-status" data-tone="${order.status === 'ready' ? 'ready' : 'active'}">${escapeHtml(status)}</span>
      </header>
      <p class="courier-ready"><svg class="icon"><use href="#courier-i-clock"></use></svg>${escapeHtml(getCourierReadyLabel(order, now))}</p>
      <div class="courier-address">
        <svg class="icon"><use href="#courier-i-pin"></use></svg>
        <span>${escapeHtml(formatCourierAddress(order.address))}</span>
      </div>
      ${phone ? `<a class="courier-call" href="tel:${escapeHtml(phone)}"><svg class="icon"><use href="#courier-i-phone"></use></svg>${escapeHtml(order.phone)}</a>` : '<p>Телефон клиента не указан</p>'}
      ${
        action
          ? `<button class="courier-order__action" type="button" data-courier-action data-order-id="${escapeHtml(
              order.id,
            )}" data-order-version="${escapeHtml(order.version)}" data-next-status="${escapeHtml(
              action.status,
            )}">${escapeHtml(action.label)}</button>`
          : ''
      }
    </article>`;
};

const initCourier = () => {
  const refs = {
    login: document.querySelector('[data-courier-login]'),
    loginForm: document.querySelector('[data-courier-login-form]'),
    pin: document.querySelector('[data-courier-pin]'),
    pinError: document.querySelector('[data-courier-pin-error]'),
    loginButton: document.querySelector('[data-courier-login-button]'),
    courierName: document.querySelector('[data-courier-name]'),
    app: document.querySelector('[data-courier-app]'),
    orders: document.querySelector('[data-courier-orders]'),
    count: document.querySelector('[data-courier-count]'),
    empty: document.querySelector('[data-courier-empty]'),
    error: document.querySelector('[data-courier-error]'),
    offline: document.querySelector('[data-courier-offline]'),
    refresh: document.querySelector('[data-courier-refresh]'),
    retry: document.querySelector('[data-courier-retry]'),
    logout: document.querySelector('[data-courier-logout]'),
    notificationCard: document.querySelector('[data-courier-notifications]'),
    notificationButton: document.querySelector('[data-courier-enable-notifications]'),
    notificationTitle: document.querySelector('[data-courier-notification-title]'),
    notificationDescription: document.querySelector('[data-courier-notification-description]'),
  };
  const isDemo = isCourierDemoLocation(window.location);
  const api = isDemo
    ? createDemoCourierApi()
    : createCourierApi();
  const pushManager = isDemo ? null : createCourierPushManager({ api });
  let currentOrders = [];
  let liveSync = null;
  let loadPromise = null;
  const pendingOrderIds = new Set();


  const renderOrders = (rawOrders, serverTime) => {
    const orders = filterCourierOrders(rawOrders);
    currentOrders = orders;
    refs.count.textContent = String(orders.length);
    refs.orders.innerHTML = orders
      .map((order) => createCourierOrderMarkup(order, new Date(serverTime)))
      .join('');
    refs.empty.hidden = orders.length > 0;
    refs.error.hidden = true;
  };


  const renderPushState = (state) => {
    const view = getCourierPushViewModel(state);
    refs.notificationCard.dataset.state = state;
    refs.notificationTitle.textContent = view.title;
    refs.notificationDescription.textContent = view.description;
    refs.notificationButton.textContent = view.button;
    refs.notificationButton.disabled = view.disabled;
    refs.notificationButton.setAttribute('aria-pressed', String(state === 'subscribed'));
  };

  const refreshPushState = async () => {
    if (!pushManager) {
      renderPushState('unsupported');
      return 'unsupported';
    }
    try {
      const { state } = await pushManager.getState();
      renderPushState(state);
      return state;
    } catch {
      renderPushState('error');
      return 'error';
    }
  };
  const loadOrders = async () => {
    if (!navigator.onLine) return;
    if (loadPromise) return loadPromise;
    refs.refresh.disabled = true;
    loadPromise = (async () => {
      try {
        const result = await api.getOrders();
        renderOrders(result.orders, result.serverTime);
        return currentOrders;
      } catch {
        refs.error.hidden = false;
        return currentOrders;
      } finally {
        refs.refresh.disabled = false;
        loadPromise = null;
      }
    })();
    return loadPromise;
  };

  const refreshOrdersAfterCurrent = async () => {
    if (loadPromise) await loadPromise;
    await loadOrders();
    return currentOrders;
  };

  const activateSession = async (session) => {
    if (refs.courierName) {
      refs.courierName.textContent = session?.courier?.name || 'Курьер';
    }
    refs.login.hidden = true;
    refs.app.hidden = false;
    await loadOrders();
    void refreshPushState();
    liveSync?.stop();
    liveSync = createStaffLiveSync({
      refresh: loadOrders,
      subscribe: (...args) => api.subscribe(...args),
      setIntervalFn: (...args) => window.setInterval(...args),
      clearIntervalFn: (timer) => window.clearInterval(timer),
      isVisible: () => document.visibilityState !== 'hidden',
    });
    liveSync.start(
      () => void liveSync?.sync(),
      (connected) => {
        if (connected) void liveSync?.sync();
      },
    );
  };

  const resetSession = () => {
    liveSync?.stop();
    liveSync = null;
    currentOrders = [];
    refs.app.hidden = true;
    refs.login.hidden = false;
    refs.pin.value = '';
    refs.pin.focus();
  };

  const setOnlineState = () => {
    refs.offline.hidden = navigator.onLine;
    if (navigator.onLine && !refs.app.hidden) void liveSync?.sync();
  };

  refs.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    refs.pinError.textContent = '';
    if (!/^\d{4}$/.test(refs.pin.value)) {
      refs.pinError.textContent = 'Введите 4 цифры';
      refs.pin.focus();
      return;
    }
    refs.loginButton.disabled = true;
    refs.loginButton.textContent = 'Входим…';
    try {
      const session = await api.login(refs.pin.value);
      await activateSession(session);
    } catch (error) {
      refs.pinError.textContent = error.message || 'Не удалось войти';
      refs.pin.select();
    } finally {
      refs.loginButton.disabled = false;
      refs.loginButton.textContent = 'Войти';
    }
  });

  refs.pin.addEventListener('input', () => {
    refs.pin.value = refs.pin.value.replace(/\D/g, '').slice(0, 4);
    refs.pinError.textContent = '';
  });
  refs.refresh.addEventListener('click', loadOrders);
  refs.retry.addEventListener('click', loadOrders);
  refs.orders.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-courier-action]');
    if (!button || button.disabled) return;

    const orderId = String(button.dataset.orderId || '');
    const status = String(button.dataset.nextStatus || '');
    const version = Number(button.dataset.orderVersion);
    if (!orderId || !status || !Number.isInteger(version) || pendingOrderIds.has(orderId)) {
      return;
    }

    pendingOrderIds.add(orderId);
    button.disabled = true;
    button.textContent = 'Сохраняем…';
    try {
      const result = await executeVersionedAction({
        entityId: orderId,
        initialVersion: version,
        execute: (freshVersion) =>
          api.changeStatus(orderId, status, freshVersion),
        refresh: refreshOrdersAfterCurrent,
        canRetry: (order) => getCourierAction(order)?.status === status,
      });
      if (result?.alreadyChanged) {
        refs.error.hidden = true;
        return;
      }
      currentOrders = applyCourierActionResult(currentOrders, orderId, result);
      renderOrders(currentOrders, new Date().toISOString());
    } catch (error) {
      if (error?.status === 401) {
        resetSession();
        refs.pinError.textContent = 'Сессия закончилась. Войдите снова';
        return;
      }
      refs.error.hidden = false;
      const heading = refs.error.querySelector('h2');
      if (heading) {
        heading.textContent =
          error?.status === 409
            ? 'Заказ уже изменился. Обновите список.'
            : error?.message || 'Не удалось изменить статус';
      }
    } finally {
      pendingOrderIds.delete(orderId);
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = getCourierAction({
          status: status === 'courier' ? 'ready' : 'handed_to_courier',
        })?.label || 'Повторить';
      }
    }
  });
  refs.logout.addEventListener('click', async () => {
    if (pushManager) await pushManager.disable().catch(() => {});
    await api.logout().catch(() => {});
    resetSession();
  });
  refs.notificationButton.addEventListener('click', async () => {
    if (!pushManager || refs.notificationButton.disabled) return;
    const currentState = refs.notificationCard.dataset.state;
    refs.notificationButton.disabled = true;
    refs.notificationButton.textContent = currentState === 'subscribed' ? 'Отключаем…' : 'Включаем…';
    try {
      const result = currentState === 'subscribed'
        ? await pushManager.disable()
        : await pushManager.enable();
      renderPushState(result.state);
    } catch {
      renderPushState('error');
    }
  });
  window.addEventListener('online', setOnlineState);
  window.addEventListener('offline', setOnlineState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' && !refs.app.hidden) {
      void liveSync?.sync();
    }
  });
  setOnlineState();

  void api
    .getSession?.()
    .then((session) => {
      if (session) return activateSession(session);
      refs.pin.focus();
      return null;
    })
    .catch(() => refs.pin.focus());

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('courier-sw.js?v=2026082202').catch(() => {});
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCourier, { once: true });
} else {
  initCourier();
}
