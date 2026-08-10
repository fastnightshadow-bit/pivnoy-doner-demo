import { PRODUCTS } from './catalog-data.js';
import { createDemoOwnerApi, createOwnerApi } from './owner-api.js';

const refs = {
  login: document.querySelector('[data-owner-login]'),
  loginForm: document.querySelector('[data-owner-login-form]'),
  pin: document.querySelector('[data-owner-pin]'),
  loginError: document.querySelector('[data-owner-login-error]'),
  app: document.querySelector('[data-owner-app]'),
  refresh: document.querySelector('[data-owner-refresh]'),
  logout: document.querySelector('[data-owner-logout]'),
  accepting: document.querySelector('[data-owner-accepting]'),
  acceptingLabel: document.querySelector('[data-owner-accepting-label]'),
  active: document.querySelector('[data-owner-active]'),
  overdue: document.querySelector('[data-owner-overdue]'),
  revenue: document.querySelector('[data-owner-revenue]'),
  products: document.querySelector('[data-owner-products]'),
  toast: document.querySelector('[data-owner-toast]'),
};

const isDemo = ['localhost', '127.0.0.1'].includes(location.hostname) ||
  new URLSearchParams(location.search).get('demo') === '1';
const api = isDemo ? createDemoOwnerApi() : createOwnerApi();
let dashboard = null;
let toastTimer = 0;

const showToast = (message) => {
  clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  toastTimer = setTimeout(() => { refs.toast.hidden = true; }, 1800);
};

const formatPrice = (value) =>
  `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')} ₽`;

const render = () => {
  if (!dashboard) return;
  refs.active.textContent = String(dashboard.activeOrders || 0);
  refs.overdue.textContent = String(dashboard.overdueOrders || 0);
  refs.revenue.textContent = formatPrice(dashboard.revenueToday);
  const settings = dashboard.settings || {};
  refs.accepting.checked = settings.acceptingOrders !== false;
  refs.acceptingLabel.textContent = refs.accepting.checked ? 'Включён' : 'Остановлен';
  const stopped = new Set(settings.stoppedProductIds || []);
  refs.products.innerHTML = PRODUCTS.map((product) => {
    const unavailable = stopped.has(product.id);
    return `<article class="owner-product${unavailable ? ' is-stopped' : ''}">
      <span>${product.name}</span>
      <button type="button" data-owner-product="${product.id}" data-available="${unavailable}">
        ${unavailable ? 'Вернуть' : 'Стоп-лист'}
      </button>
    </article>`;
  }).join('');
};

const loadDashboard = async () => {
  dashboard = await api.getDashboard();
  render();
};

refs.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  refs.loginError.hidden = true;
  const button = refs.loginForm.querySelector('button');
  button.disabled = true;
  try {
    await api.login(refs.pin.value);
    refs.login.hidden = true;
    refs.app.hidden = false;
    await loadDashboard();
  } catch (error) {
    refs.loginError.textContent = error.message || 'Не удалось войти';
    refs.loginError.hidden = false;
    refs.pin.select();
  } finally {
    button.disabled = false;
  }
});

refs.accepting.addEventListener('change', async () => {
  const previous = !refs.accepting.checked;
  refs.accepting.disabled = true;
  try {
    const settings = await api.setAcceptingOrders(refs.accepting.checked);
    dashboard.settings = { ...dashboard.settings, ...settings };
    render();
    showToast(refs.accepting.checked ? 'Приём заказов включён' : 'Приём заказов остановлен');
  } catch {
    refs.accepting.checked = previous;
    showToast('Настройка не сохранена');
  } finally {
    refs.accepting.disabled = false;
  }
});

refs.products.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-owner-product]');
  if (!button) return;
  const available = button.dataset.available === 'true';
  button.disabled = true;
  try {
    await api.setAvailability(button.dataset.ownerProduct, available);
    const stopped = new Set(dashboard.settings.stoppedProductIds || []);
    if (available) stopped.delete(button.dataset.ownerProduct);
    else stopped.add(button.dataset.ownerProduct);
    dashboard.settings.stoppedProductIds = [...stopped];
    render();
    showToast('Стоп-лист обновлён');
  } catch {
    button.disabled = false;
    showToast('Изменение не сохранено');
  }
});

refs.refresh.addEventListener('click', () => void loadDashboard());
refs.logout.addEventListener('click', async () => {
  await api.logout().catch(() => {});
  dashboard = null;
  refs.app.hidden = true;
  refs.login.hidden = false;
  refs.pin.value = '';
  refs.pin.focus();
});
