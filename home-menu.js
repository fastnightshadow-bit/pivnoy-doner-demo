import { CATEGORIES, PRODUCTS } from './catalog-data.js';
import { getProductsByCategory } from './catalog-state.js';

export const getMenuProducts = (category) =>
  getProductsByCategory(PRODUCTS, category);

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

export const createProductQuantityControl = (
  product,
  quantity = 0,
  namespace = 'menu',
) => {
  const safeQuantity = Math.max(0, Number(quantity) || 0);

  if (safeQuantity === 0) {
    return `
      <button
        class="${namespace}-add"
        type="button"
        aria-label="Настроить ${product.name}"
        data-product-control="${product.id}"
        data-control-namespace="${namespace}"
        data-request-product="${product.id}"
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

export const createMenuProductCard = (product, quantity = 0) => {
  const media = product.image
    ? `<img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async" />`
    : `<span class="menu-product__placeholder" aria-hidden="true"><svg class="icon"><use href="#home-i-${product.icon}"></use></svg></span>`;
  const badge = product.badge
    ? `<span class="menu-product__badge">${product.badge}</span>`
    : '';
  const control = createProductQuantityControl(product, quantity, 'menu');
  const price = `${product.pricePrefix ? `${product.pricePrefix} ` : ''}${product.price} ₽`;

  return `
    <article class="menu-product" data-menu-product="${product.id}">
      <button class="menu-product__link" type="button" data-open-product="${product.id}" aria-label="Открыть ${product.name}"></button>
      <div class="menu-product__media">${media}${badge}</div>
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
