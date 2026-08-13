import { CATEGORIES, PRODUCTS } from './catalog-data.js';
import { getProductsByCategory } from './catalog-state.js';
import {
  calculateProductPrice,
  getProductDescription,
  MEAT_LABELS,
} from './product-config.js';

export const getMenuCategory = (categoryId) =>
  CATEGORIES.find(({ id }) => id === categoryId) ?? null;

export const MEAT_MENU_CATEGORIES = new Set(['shawarma', 'doner']);
const MENU_MEATS = Object.freeze(['chicken', 'beef']);

export const getMenuMeatOptions = (categoryId) =>
  MEAT_MENU_CATEGORIES.has(categoryId) ? [...MENU_MEATS] : [];

export const normalizeMenuMeat = (categoryId, meat = 'chicken') =>
  getMenuMeatOptions(categoryId).includes(meat) ? meat : 'chicken';

export const getMenuProducts = (categoryId, selectedMeat = 'chicken') => {
  const category = getMenuCategory(categoryId);
  if (!category || category.empty) return [];

  const products = getProductsByCategory(PRODUCTS, category.id);

  if (!MEAT_MENU_CATEGORIES.has(category.id)) return products;

  const meat = normalizeMenuMeat(category.id, selectedMeat);

  return products.map((product) => ({
    ...product,
    description: getProductDescription(product, meat),
    price: calculateProductPrice(product.id, {
      meat,
      size: category.id === 'shawarma' ? 'standard' : 'single',
    }),
    pricePrefix: '',
    selectedMeat: meat,
    lockMeat: true,
  }));
};

export const createMeatSubgroupSwitch = (categoryId, selectedMeat) => {
  const options = getMenuMeatOptions(categoryId);
  if (!options.length) return '';
  const activeMeat = normalizeMenuMeat(categoryId, selectedMeat);

  return `
    <div class="menu-meat-switch" role="group" aria-label="Выбор мяса">
      ${options.map((meat) => `
        <button
          class="${meat === activeMeat ? 'is-active' : ''}"
          type="button"
          aria-pressed="${meat === activeMeat}"
          data-menu-meat="${meat}"
        >${MEAT_LABELS[meat]}</button>`).join('')}
    </div>`;
};

export const resolveMenuProductLine = (
  lines,
  product,
  preferredLine = null,
) => {
  if (!product?.id) return null;
  const meatLabel = product.selectedMeat
    ? MEAT_LABELS[product.selectedMeat]
    : '';
  const matches = (Array.isArray(lines) ? lines : []).filter(
    (line) =>
      line.productId === product.id &&
      (!meatLabel || line.meat === meatLabel),
  );
  if (!matches.length) return null;
  return matches.find(({ lineId }) => lineId === preferredLine?.lineId)
    ?? matches.at(-1)
    ?? null;
};

export const createCategoryTabs = (activeCategory) =>
  CATEGORIES.map(
    (category) => `
      <button
        class="category${category.id === activeCategory ? ' is-active' : ''}"
        type="button"
        aria-pressed="${category.id === activeCategory}"
        data-category="${category.id}"
      ><span>${category.label}</span></button>`,
  ).join('');

export const createDesktopCategoryLinks = (activeCategory) =>
  CATEGORIES.map(
    (category) => `
      <a
        href="#categories"
        class="${category.id === activeCategory ? 'is-active' : ''}"
        data-category="${category.id}"
        ${category.id === activeCategory ? 'aria-current="true"' : ''}
      >${category.shortLabel ?? category.label}</a>`,
  ).join('');

export const createEmptyCategoryState = (category) => `
  <section class="menu-empty" aria-labelledby="menu-empty-title">
    <span class="menu-empty__icon" aria-hidden="true">
      <svg class="icon"><use href="#home-i-${category?.icon ?? 'leaf'}"></use></svg>
    </span>
    <h2 id="menu-empty-title">Скоро появится</h2>
    <p>Мы готовим новые позиции</p>
  </section>`;

export const createProductQuantityControl = (
  product,
  quantity = 0,
  namespace = 'menu',
  { available = true, unavailableLabel = 'Нет в наличии' } = {},
) => {
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const variantData = product.selectedMeat
    ? ` data-product-meat="${product.selectedMeat}" data-lock-meat="${Boolean(product.lockMeat)}"`
    : '';

  if (!available) {
    return `
      <button
        class="${namespace}-add is-unavailable"
        type="button"
        aria-label="${product.name} — ${unavailableLabel.toLocaleLowerCase('ru-RU')}"
        data-product-control="${product.id}"
        data-control-namespace="${namespace}"
        disabled
      >${unavailableLabel}</button>`;
  }

  if (safeQuantity === 0) {
    const requestAttribute = product.quickAdd
      ? `data-quick-add="${product.id}"`
      : `data-request-product="${product.id}"`;
    return `
      <button
        class="${namespace}-add"
        type="button"
        aria-label="Настроить ${product.name}"
        data-product-control="${product.id}"
        data-control-namespace="${namespace}"
        ${requestAttribute}
        ${variantData}
      >
        <svg class="icon"><use href="#home-i-plus"></use></svg>
      </button>`;
  }

  return `
    <div
      class="${namespace}-quantity"
      data-product-control="${product.id}"
      data-control-namespace="${namespace}"
      data-quantity="${product.id}"
      ${variantData}
    >
      <button type="button" aria-label="Уменьшить ${product.name}" data-product-id="${product.id}" data-quantity-change="-1">
        <svg class="icon"><use href="#home-i-minus"></use></svg>
      </button>
      <output aria-live="polite">${safeQuantity}</output>
      <button type="button" aria-label="Увеличить ${product.name}" data-product-id="${product.id}" data-quantity-change="1">
        <svg class="icon"><use href="#home-i-plus"></use></svg>
      </button>
    </div>`;
};

export const createMenuProductCard = (
  product,
  quantity = 0,
  { available = true, unavailableLabel = 'Нет в наличии' } = {},
) => {
  if (product.textOnly) {
    const control = createProductQuantityControl(product, quantity, 'menu', {
      available,
      unavailableLabel,
    });
    return `
      <article class="menu-product menu-product--text${available ? '' : ' is-unavailable'}" data-menu-product="${product.id}">
        <div class="menu-product__content">
          <div><h3>${product.name}</h3></div>
          <footer${quantity > 0 ? ' class="has-quantity"' : ''}>
            <strong>${product.price} ₽</strong>
            ${control}
          </footer>
        </div>
      </article>`;
  }

  const media = product.image
    ? `<img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async" />`
    : `<span class="menu-product__placeholder" aria-hidden="true"><svg class="icon"><use href="#home-i-${product.icon}"></use></svg></span>`;
  const badge = product.badge
    ? `<span class="menu-product__badge">${product.badge}</span>`
    : '';
  const control = createProductQuantityControl(product, quantity, 'menu', {
    available,
    unavailableLabel,
  });
  const price = `${product.pricePrefix ? `${product.pricePrefix} ` : ''}${product.price} ₽`;

  return `
    <article class="menu-product${available ? '' : ' is-unavailable'}" data-menu-product="${product.id}"${product.selectedMeat ? ` data-product-meat="${product.selectedMeat}"` : ''}>
      ${available ? `<button class="menu-product__link" type="button" data-open-product="${product.id}"${product.selectedMeat ? ` data-product-meat="${product.selectedMeat}" data-lock-meat="true"` : ''} aria-label="Открыть ${product.name}"></button>` : ''}
      <div class="menu-product__media">${media}${badge}${available ? '' : `<span class="menu-product__unavailable">${unavailableLabel}</span>`}</div>
      <div class="menu-product__content">
        <div>
          <h3>${product.name}</h3>
          <p>${product.description}</p>
        </div>
        <footer${quantity > 0 ? ' class="has-quantity"' : ''}>
          <strong>${price}</strong>
          ${control}
        </footer>
      </div>
    </article>`;
};
