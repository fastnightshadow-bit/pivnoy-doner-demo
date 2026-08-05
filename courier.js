import {
  createCourierApi,
  createDemoCourierApi,
  isCourierDemoLocation,
} from './courier-api.js';
import {
  filterCourierOrders,
  formatCourierAddress,
  getCourierReadyLabel,
  getCourierStatusLabel,
  sanitizeCourierPhone,
} from './courier-state.js';

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
  };
  const api = isCourierDemoLocation(window.location)
    ? createDemoCourierApi()
    : createCourierApi();
  let knownOrderIds = new Set();
  let pollTimer = 0;
  let loading = false;

  const showNotification = async (order) => {
    if (globalThis.Notification?.permission !== 'granted') return;
    const registration = await navigator.serviceWorker?.ready;
    await registration?.showNotification?.('Новая доставка', {
      body: `Заказ #${order.number} · ${formatCourierAddress(order.address)}`,
      icon: 'assets/courier/icon-192.png',
      tag: `courier-${order.id}`,
    });
  };

  const renderOrders = (rawOrders, serverTime) => {
    const orders = filterCourierOrders(rawOrders);
    const currentIds = new Set(orders.map(({ id }) => id));
    if (knownOrderIds.size) {
      orders
        .filter(({ id }) => !knownOrderIds.has(id))
        .forEach(showNotification);
    }
    knownOrderIds = currentIds;
    refs.count.textContent = String(orders.length);
    refs.orders.innerHTML = orders
      .map((order) => createCourierOrderMarkup(order, new Date(serverTime)))
      .join('');
    refs.empty.hidden = orders.length > 0;
    refs.error.hidden = true;
  };

  const loadOrders = async () => {
    if (loading || !navigator.onLine) return;
    loading = true;
    refs.refresh.disabled = true;
    try {
      const result = await api.getOrders();
      renderOrders(result.orders, result.serverTime);
    } catch {
      refs.error.hidden = false;
    } finally {
      loading = false;
      refs.refresh.disabled = false;
    }
  };

  const startPolling = () => {
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(loadOrders, 15000);
  };

  const setOnlineState = () => {
    refs.offline.hidden = navigator.onLine;
    if (navigator.onLine && !refs.app.hidden) loadOrders();
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
      if (refs.courierName) {
        refs.courierName.textContent = session?.courier?.name || 'Курьер';
      }
      refs.login.hidden = true;
      refs.app.hidden = false;
      await loadOrders();
      startPolling();
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
  refs.logout.addEventListener('click', async () => {
    await api.logout().catch(() => {});
    window.clearInterval(pollTimer);
    refs.app.hidden = true;
    refs.login.hidden = false;
    refs.pin.value = '';
    refs.pin.focus();
  });
  refs.notificationButton.addEventListener('click', async () => {
    if (!('Notification' in globalThis)) {
      refs.notificationCard.hidden = true;
      return;
    }
    const permission = await Notification.requestPermission();
    refs.notificationCard.hidden = permission === 'granted';
  });
  if (!('Notification' in globalThis) || Notification.permission === 'granted') {
    refs.notificationCard.hidden = true;
  }
  window.addEventListener('online', setOnlineState);
  window.addEventListener('offline', setOnlineState);
  setOnlineState();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('courier-sw.js').catch(() => {});
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCourier, { once: true });
} else {
  initCourier();
}
