import { CATEGORIES, PRODUCTS } from './catalog-data.js';
import {
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
} from './product-config.js';
import {
  buildCategorySummaries,
  filterOwnerMenu,
  getGlobalMeatOptions,
  getProductOptionGroups,
} from './owner-menu.js?v=2026082102';
import { createDemoOwnerApi, createOwnerApi } from './owner-api.js?v=2026082102';

const refs = {
  login: document.querySelector('[data-owner-login]'),
  loginForm: document.querySelector('[data-owner-login-form]'),
  pin: document.querySelector('[data-owner-pin]'),
  loginError: document.querySelector('[data-owner-login-error]'),
  app: document.querySelector('[data-owner-app]'),
  refresh: document.querySelector('[data-owner-refresh]'),
  logout: document.querySelector('[data-owner-logout]'),
  accepting: document.querySelector('[data-owner-accepting]'),
  globalMeats: document.querySelector('[data-owner-global-meats]'),
  acceptingLabel: document.querySelector('[data-owner-accepting-label]'),
  active: document.querySelector('[data-owner-active]'),
  overdue: document.querySelector('[data-owner-overdue]'),
  revenue: document.querySelector('[data-owner-revenue]'),
  menuView: document.querySelector('[data-owner-menu-view]'),
  categoryView: document.querySelector('[data-owner-category-view]'),
  stoppedView: document.querySelector('[data-owner-stopped-view]'),
  search: document.querySelector('[data-owner-search]'),
  categorySearch: document.querySelector('[data-owner-category-search]'),
  categories: document.querySelector('[data-owner-categories]'),
  categoryHeading: document.querySelector('[data-owner-category-heading]'),
  searchEmpty: document.querySelector('[data-owner-search-empty]'),
  categoryTitle: document.querySelector('[data-owner-category-title]'),
  categoryControl: document.querySelector('[data-owner-category-control]'),
  productList: document.querySelector('[data-owner-product-list]'),
  stoppedCount: document.querySelector('[data-owner-stopped-count]'),
  stoppedTitleCount: document.querySelector('[data-owner-stopped-title-count]'),
  stoppedList: document.querySelector('[data-owner-stopped-list]'),
  stoppedEmpty: document.querySelector('[data-owner-stopped-empty]'),
  openStopped: document.querySelector('[data-owner-open-stopped]'),
  back: document.querySelector('[data-owner-back]'),
  stoppedBack: document.querySelector('[data-owner-stopped-back]'),
  toast: document.querySelector('[data-owner-toast]'),
};

const isDemo = ['localhost', '127.0.0.1'].includes(location.hostname) ||
  new URLSearchParams(location.search).get('demo') === '1';
const api = isDemo ? createDemoOwnerApi() : createOwnerApi();
let dashboard = null;
let activeCategoryId = '';
let busy = false;
let toastTimer = 0;
const expandedProducts = new Set();

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatPrice = (value) =>
  `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')} ₽`;

const countLabel = (count) => {
  const value = Math.max(0, Number(count) || 0);
  const lastTwo = value % 100;
  const last = value % 10;
  const word = lastTwo >= 11 && lastTwo <= 14
    ? 'позиций'
    : last === 1
      ? 'позиция'
      : last >= 2 && last <= 4
        ? 'позиции'
        : 'позиций';
  return `${value} ${word}`;
};

const showToast = (message) => {
  clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  toastTimer = setTimeout(() => { refs.toast.hidden = true; }, 2200);
};

const getSettings = () => ({
  acceptingOrders: dashboard?.settings?.acceptingOrders !== false,
  stoppedProductIds: dashboard?.settings?.stoppedProductIds || [],
  stoppedMeatIds: dashboard?.settings?.stoppedMeatIds || [],
  stoppedSauceIds: dashboard?.settings?.stoppedSauceIds || [],
  stoppedAddonIds: dashboard?.settings?.stoppedAddonIds || [],
});

const getStoppedSet = (kind) => {
  const settings = getSettings();
  return new Set({
    product: settings.stoppedProductIds,
    meat: settings.stoppedMeatIds,
    sauce: settings.stoppedSauceIds,
    addon: settings.stoppedAddonIds,
  }[kind] || []);
};

const stoppedTotal = () => {
  const settings = getSettings();
  return [
    settings.stoppedProductIds,
    settings.stoppedMeatIds,
    settings.stoppedSauceIds,
    settings.stoppedAddonIds,
  ].reduce((total, ids) => total + new Set(ids).size, 0);
};

const switchMarkup = ({ checked, label, attributes = '', disabled = false }) => `
  <button
    class="owner-switch${checked ? ' is-on' : ''}"
    type="button"
    role="switch"
    aria-checked="${checked}"
    aria-label="${escapeHtml(label)}"
    ${attributes}
    ${disabled || busy ? 'disabled' : ''}
  ><i aria-hidden="true"></i></button>`;

const optionLabel = (kind, id) => ({
  meat: MEAT_LABELS[id],
  sauce: PRODUCT_SAUCES[id]?.label,
  addon: PRODUCT_ADDONS[id]?.label,
}[kind] || id);

const optionPrice = (kind, id) => ({
  sauce: PRODUCT_SAUCES[id]?.price,
  addon: PRODUCT_ADDONS[id]?.price,
}[kind] || 0);

const showView = (name) => {
  refs.menuView.hidden = name !== 'menu';
  refs.categoryView.hidden = name !== 'category';
  refs.stoppedView.hidden = name !== 'stopped';
  window.scrollTo({ top: 0, behavior: 'auto' });
};

const renderMain = () => {
  const settings = getSettings();
  refs.globalMeats.innerHTML = getGlobalMeatOptions(settings)
    .map((meat) => `<article class="owner-global-meat">
      <span><strong>${escapeHtml(meat.label)}</strong><small>${meat.available ? 'Есть в наличии' : 'Полностью отключено'}</small></span>
      ${switchMarkup({
        checked: meat.available,
        label: `${meat.label}: ${meat.available ? 'включено' : 'выключено'}`,
        attributes: `data-owner-option-toggle data-kind="meat" data-id="${escapeHtml(meat.id)}"`,
      })}
    </article>`)
    .join('');
  const categories = filterOwnerMenu(
    buildCategorySummaries({
      categories: CATEGORIES,
      products: PRODUCTS,
      stoppedProductIds: settings.stoppedProductIds,
    }),
    refs.search.value,
  );
  refs.categoryHeading.textContent = `Категории · ${categories.length}`;
  refs.searchEmpty.hidden = categories.length > 0;
  refs.categories.innerHTML = categories.map((category) => {
    const details = category.productCount === 0
      ? 'Пока нет позиций'
      : category.stoppedCount > 0
        ? `Отключено: ${category.stoppedCount}`
        : `${category.productCount} товаров`;
    return `<button class="owner-category-row" type="button" data-owner-open-category="${escapeHtml(category.id)}">
      <span><strong>${escapeHtml(category.label)}</strong><small>${escapeHtml(details)}</small></span>
      <i class="owner-chevron" aria-hidden="true"></i>
    </button>`;
  }).join('');
  const total = stoppedTotal();
  refs.stoppedCount.textContent = countLabel(total);
};

const productMeta = (product) => {
  const weight = String(product.description || '').match(/\b\d+\s*г\b/i)?.[0] || '';
  return [weight, `${product.pricePrefix ? `${product.pricePrefix} ` : ''}${formatPrice(product.price)}`]
    .filter(Boolean)
    .join(' · ');
};

const renderOptionGroups = (product) => {
  const groups = getProductOptionGroups(product.id);
  if (!expandedProducts.has(product.id) || groups.length === 0) return '';
  return `<div class="owner-option-groups">${groups.map((group) => {
    const stopped = getStoppedSet(group.kind);
    return `<section class="owner-option-group">
      <h3>${escapeHtml(group.label)}</h3>
      ${group.options.map((option) => `<div class="owner-option-row">
        <span><strong>${escapeHtml(option.label)}</strong><small>${option.price ? formatPrice(option.price) : 'Вариант блюда'}</small></span>
        ${switchMarkup({
          checked: !stopped.has(option.id),
          label: `${option.label}: ${stopped.has(option.id) ? 'выключено' : 'включено'}`,
          attributes: `data-owner-option-toggle data-kind="${group.kind}" data-id="${escapeHtml(option.id)}"`,
        })}
      </div>`).join('')}
    </section>`;
  }).join('')}</div>`;
};

const renderCategory = () => {
  const settings = getSettings();
  const summary = buildCategorySummaries({
    categories: CATEGORIES,
    products: PRODUCTS,
    stoppedProductIds: settings.stoppedProductIds,
  }).find(({ id }) => id === activeCategoryId);
  if (!summary) return;
  refs.categoryTitle.textContent = summary.label;
  refs.categoryControl.innerHTML = `<div>
      <strong>Вся категория</strong>
      <small>${summary.productCount ? (summary.allAvailable ? 'Все позиции включены' : `Отключено: ${summary.stoppedCount}`) : 'Пока нет позиций'}</small>
    </div>
    ${switchMarkup({
      checked: summary.allAvailable,
      label: `${summary.label}: ${summary.allAvailable ? 'включена' : 'выключена'}`,
      attributes: `data-owner-category-toggle data-id="${escapeHtml(summary.id)}"`,
      disabled: summary.productCount === 0,
    })}`;
  const query = String(refs.categorySearch.value || '').trim().toLocaleLowerCase('ru-RU');
  const products = summary.products.filter((product) =>
    !query || [product.name, product.description].some((value) =>
      String(value || '').toLocaleLowerCase('ru-RU').includes(query),
    ),
  );
  const stopped = getStoppedSet('product');
  refs.productList.innerHTML = products.length
    ? products.map((product) => {
        const groups = getProductOptionGroups(product.id);
        const expanded = expandedProducts.has(product.id);
        const available = !stopped.has(product.id);
        return `<article class="owner-product-row${available ? '' : ' is-stopped'}">
          <div class="owner-product-row__main">
            ${switchMarkup({
              checked: available,
              label: `${product.name}: ${available ? 'включено' : 'выключено'}`,
              attributes: `data-owner-product-toggle data-id="${escapeHtml(product.id)}"`,
            })}
            <span class="owner-product-row__media">${product.image
              ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy" />`
              : '<i aria-hidden="true">•</i>'}</span>
            <span class="owner-product-row__copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(productMeta(product))}</small></span>
            ${groups.length ? `<button class="owner-expand" type="button" data-owner-expand="${escapeHtml(product.id)}" aria-expanded="${expanded}"><span>${groups.reduce((total, group) => total + group.options.length, 0)}</span><i class="owner-expand__chevron" aria-hidden="true"></i></button>` : ''}
          </div>
          ${renderOptionGroups(product)}
        </article>`;
      }).join('')
    : '<p class="owner-empty">В этой категории ничего не найдено</p>';
};

const renderStopped = () => {
  const entries = [];
  for (const productId of getStoppedSet('product')) {
    const product = PRODUCTS.find(({ id }) => id === productId);
    if (product) entries.push({ kind: 'product', id: product.id, label: product.name, meta: 'Блюдо' });
  }
  for (const kind of ['meat', 'sauce', 'addon']) {
    for (const id of getStoppedSet(kind)) {
      entries.push({ kind, id, label: optionLabel(kind, id), meta: kind === 'meat' ? 'Мясо' : kind === 'sauce' ? 'Соус' : 'Добавка' });
    }
  }
  refs.stoppedTitleCount.textContent = countLabel(entries.length);
  refs.stoppedEmpty.hidden = entries.length > 0;
  refs.stoppedList.innerHTML = entries.map((entry) => `<article class="owner-stopped-row">
    <span><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.meta)}${optionPrice(entry.kind, entry.id) ? ` · ${formatPrice(optionPrice(entry.kind, entry.id))}` : ''}</small></span>
    ${switchMarkup({
      checked: false,
      label: `Вернуть ${entry.label} в меню`,
      attributes: entry.kind === 'product'
        ? `data-owner-product-toggle data-id="${escapeHtml(entry.id)}"`
        : `data-owner-option-toggle data-kind="${entry.kind}" data-id="${escapeHtml(entry.id)}"`,
    })}
  </article>`).join('');
};

const render = () => {
  if (!dashboard) return;
  refs.active.textContent = String(dashboard.activeOrders || 0);
  refs.overdue.textContent = String(dashboard.overdueOrders || 0);
  refs.revenue.textContent = formatPrice(dashboard.revenueToday);
  const settings = getSettings();
  refs.accepting.checked = settings.acceptingOrders;
  refs.accepting.disabled = busy;
  refs.acceptingLabel.textContent = settings.acceptingOrders ? 'Включён' : 'Остановлен';
  renderMain();
  if (activeCategoryId) renderCategory();
  renderStopped();
};

const loadDashboard = async () => {
  dashboard = await api.getDashboard();
  render();
};

const updateStopped = (kind, id, available) => {
  const key = { product: 'stoppedProductIds', meat: 'stoppedMeatIds', sauce: 'stoppedSauceIds', addon: 'stoppedAddonIds' }[kind];
  const stopped = new Set(dashboard.settings[key] || []);
  if (available) stopped.delete(id);
  else stopped.add(id);
  dashboard.settings[key] = [...stopped];
};

const runAction = async (action, successMessage) => {
  if (busy) return;
  busy = true;
  render();
  try {
    await action();
    showToast(successMessage);
  } catch (error) {
    showToast(error?.message || 'Изменение не сохранено');
    await loadDashboard().catch(() => {});
  } finally {
    busy = false;
    render();
  }
};

const handleProductToggle = (button) => {
  const id = button.dataset.id;
  const available = getStoppedSet('product').has(id);
  return runAction(async () => {
    await api.setAvailability(id, available);
    updateStopped('product', id, available);
  }, available ? 'Товар возвращён в меню' : 'Товар добавлен в стоп-лист');
};

const handleOptionToggle = (button) => {
  const { kind, id } = button.dataset;
  const available = getStoppedSet(kind).has(id);
  return runAction(async () => {
    await api.setOptionAvailability(kind, id, available);
    updateStopped(kind, id, available);
  }, available ? 'Позиция возвращена в меню' : 'Позиция добавлена в стоп-лист');
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
    showView('menu');
    await loadDashboard();
  } catch (error) {
    refs.loginError.textContent = error.message || 'Не удалось войти';
    refs.loginError.hidden = false;
    refs.pin.select();
  } finally {
    button.disabled = false;
  }
});

refs.accepting.addEventListener('change', () => {
  const next = refs.accepting.checked;
  void runAction(async () => {
    const settings = await api.setAcceptingOrders(next);
    dashboard.settings = { ...dashboard.settings, ...settings };
  }, next ? 'Приём заказов включён' : 'Приём заказов остановлен');
});

refs.search.addEventListener('input', renderMain);
refs.globalMeats.addEventListener('click', (event) => {
  const option = event.target.closest('[data-owner-option-toggle]');
  if (option) void handleOptionToggle(option);
});

refs.categorySearch.addEventListener('input', renderCategory);
refs.categories.addEventListener('click', (event) => {
  const button = event.target.closest('[data-owner-open-category]');
  if (!button) return;
  activeCategoryId = button.dataset.ownerOpenCategory;
  refs.categorySearch.value = '';
  renderCategory();
  showView('category');
});

refs.categoryControl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-owner-category-toggle]');
  if (!button) return;
  const summary = buildCategorySummaries({
    categories: CATEGORIES,
    products: PRODUCTS,
    stoppedProductIds: getSettings().stoppedProductIds,
  }).find(({ id }) => id === button.dataset.id);
  if (!summary?.productCount) return;
  const available = !summary.allAvailable;
  void runAction(async () => {
    const result = await api.setCategoryAvailability(summary.id, available);
    for (const productId of result.productIds || summary.products.map(({ id }) => id)) {
      updateStopped('product', productId, available);
    }
  }, available ? 'Категория включена' : 'Категория добавлена в стоп-лист');
});

refs.productList.addEventListener('click', (event) => {
  const expand = event.target.closest('[data-owner-expand]');
  if (expand) {
    const id = expand.dataset.ownerExpand;
    if (expandedProducts.has(id)) expandedProducts.delete(id);
    else expandedProducts.add(id);
    renderCategory();
    return;
  }
  const product = event.target.closest('[data-owner-product-toggle]');
  if (product) void handleProductToggle(product);
  const option = event.target.closest('[data-owner-option-toggle]');
  if (option) void handleOptionToggle(option);
});

refs.stoppedList.addEventListener('click', (event) => {
  const product = event.target.closest('[data-owner-product-toggle]');
  if (product) void handleProductToggle(product);
  const option = event.target.closest('[data-owner-option-toggle]');
  if (option) void handleOptionToggle(option);
});

refs.back.addEventListener('click', () => showView('menu'));
refs.openStopped.addEventListener('click', () => { renderStopped(); showView('stopped'); });
refs.stoppedBack.addEventListener('click', () => showView('menu'));
refs.refresh.addEventListener('click', () => void runAction(loadDashboard, 'Данные обновлены'));
refs.logout.addEventListener('click', async () => {
  await api.logout().catch(() => {});
  dashboard = null;
  activeCategoryId = '';
  expandedProducts.clear();
  refs.app.hidden = true;
  refs.login.hidden = false;
  refs.pin.value = '';
  refs.pin.focus();
});
