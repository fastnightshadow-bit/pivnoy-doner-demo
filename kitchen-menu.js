import {
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
} from './product-config.js';
import {
  filterOwnerMenu,
  getProductOptionGroups,
} from './owner-menu.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatPrice = (value) =>
  `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')} ₽`;

const getStoppedSet = (settings, kind) => new Set({
  product: settings?.stoppedProductIds,
  meat: settings?.stoppedMeatIds,
  sauce: settings?.stoppedSauceIds,
  addon: settings?.stoppedAddonIds,
}[kind] || []);

const switchMarkup = ({ checked, label, attribute, disabled = false }) => `
  <button
    class="availability-switch${checked ? ' is-available' : ' is-stopped'}"
    type="button"
    role="switch"
    aria-checked="${checked}"
    aria-label="${escapeHtml(label)}"
    ${attribute}
    ${disabled ? 'disabled' : ''}
  ><i aria-hidden="true"></i></button>`;

const productMeta = (product) => {
  const weight = String(product.description || '').match(/\b\d+\s*г\b/i)?.[0] || '';
  return [
    weight,
    `${product.pricePrefix ? `${product.pricePrefix} ` : ''}${formatPrice(product.price)}`,
  ].filter(Boolean).join(' · ');
};

const optionMeta = (option) => option.price
  ? formatPrice(option.price)
  : 'Вариант блюда';

const renderOptionGroups = ({ product, settings, expandedIds }) => {
  if (!expandedIds.has(product.id)) return '';
  return getProductOptionGroups(product.id).map((group) => {
    const stopped = getStoppedSet(settings, group.kind);
    return `<section class="kitchen-menu-options">
      <h4>${escapeHtml(group.label)}</h4>
      ${group.options.map((option) => {
        const available = !stopped.has(option.id);
        return `<div class="kitchen-menu-option-row${available ? '' : ' is-stopped'}">
          <span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(optionMeta(option))}</small></span>
          <span class="availability-state${available ? '' : ' availability-state--stopped'}">${available ? 'В меню' : 'Нет в наличии'}</span>
          ${switchMarkup({
            checked: available,
            label: `${option.label}: ${available ? 'в меню' : 'нет в наличии'}`,
            attribute: `data-kitchen-option-toggle="${escapeHtml(`${group.kind}:${option.id}`)}" data-kind="${escapeHtml(group.kind)}" data-id="${escapeHtml(option.id)}"`,
          })}
        </div>`;
      }).join('')}
    </section>`;
  }).join('');
};

export const renderKitchenMenu = ({
  categories = [],
  settings = {},
  query = '',
  expandedIds = new Set(),
  showProducts = true,
} = {}) => {
  const stoppedProducts = getStoppedSet(settings, 'product');
  const filtered = filterOwnerMenu(categories, query);
  return filtered.map((category) => {
    const products = category.products || [];
    const stoppedCount = products.filter(({ id }) => stoppedProducts.has(id)).length;
    const categoryAvailable = products.length > 0 && stoppedCount === 0;
    return `<section class="kitchen-menu-category" data-kitchen-category="${escapeHtml(category.id)}">
      <div class="kitchen-menu-category-row">
        <button type="button" data-kitchen-open-category="${escapeHtml(category.id)}">
          <span><strong>${escapeHtml(category.label)}</strong><small>${products.length ? `${products.length} товаров${stoppedCount ? ` · отключено ${stoppedCount}` : ''}` : 'Пока нет позиций'}</small></span>
          <em aria-hidden="true">›</em>
        </button>
        ${switchMarkup({
          checked: categoryAvailable,
          label: `${category.label}: ${categoryAvailable ? 'в меню' : 'есть недоступные позиции'}`,
          attribute: `data-kitchen-category-toggle="${escapeHtml(category.id)}"`,
          disabled: products.length === 0,
        })}
      </div>
      ${showProducts ? `<div class="kitchen-menu-products">${products.map((product) => {
        const available = !stoppedProducts.has(product.id);
        const optionCount = getProductOptionGroups(product.id)
          .reduce((total, group) => total + group.options.length, 0);
        return `<article class="kitchen-menu-product${available ? '' : ' is-stopped'}">
          <div class="kitchen-menu-product__main">
            ${switchMarkup({
              checked: available,
              label: `${product.name}: ${available ? 'в меню' : 'нет в наличии'}`,
              attribute: `data-kitchen-product-toggle="${escapeHtml(product.id)}"`,
            })}
            <span class="kitchen-menu-product__media">${product.image
              ? `<img src="${escapeHtml(product.image)}" alt="" loading="lazy" />`
              : '<i aria-hidden="true">•</i>'}</span>
            <span class="kitchen-menu-product__copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(productMeta(product))}</small></span>
            <span class="availability-state${available ? '' : ' availability-state--stopped'}">${available ? 'В меню' : 'Нет в наличии'}</span>
            ${optionCount ? `<button class="kitchen-menu-expand" type="button" data-kitchen-expand="${escapeHtml(product.id)}" aria-expanded="${expandedIds.has(product.id)}"><span>${optionCount}</span><i aria-hidden="true">${expandedIds.has(product.id) ? '⌃' : '⌄'}</i></button>` : ''}
          </div>
          ${renderOptionGroups({ product, settings, expandedIds })}
        </article>`;
      }).join('')}</div>` : ''}
    </section>`;
  }).join('');
};

const optionDefinition = (kind, id) => ({
  meat: { label: MEAT_LABELS[id] || id, meta: 'Мясо' },
  sauce: { label: PRODUCT_SAUCES[id]?.label || id, meta: 'Соус' },
  addon: { label: PRODUCT_ADDONS[id]?.label || id, meta: 'Добавка' },
}[kind]);

export const getKitchenStoppedEntries = ({ products = [], settings = {} } = {}) => {
  const entries = [];
  for (const id of getStoppedSet(settings, 'product')) {
    const product = products.find((item) => item.id === id);
    if (product) entries.push({ kind: 'product', id, label: product.name, meta: 'Блюдо' });
  }
  for (const kind of ['meat', 'sauce', 'addon']) {
    for (const id of getStoppedSet(settings, kind)) {
      entries.push({ kind, id, ...optionDefinition(kind, id) });
    }
  }
  return entries;
};

export const renderKitchenStoppedMenu = (entries = []) => entries.map((entry) => `
  <article class="kitchen-menu-stopped-row">
    <span><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.meta)}</small></span>
    ${switchMarkup({
      checked: false,
      label: `Вернуть ${entry.label} в меню`,
      attribute: entry.kind === 'product'
        ? `data-kitchen-product-toggle="${escapeHtml(entry.id)}"`
        : `data-kitchen-option-toggle="${escapeHtml(`${entry.kind}:${entry.id}`)}" data-kind="${escapeHtml(entry.kind)}" data-id="${escapeHtml(entry.id)}"`,
    })}
  </article>`).join('');
