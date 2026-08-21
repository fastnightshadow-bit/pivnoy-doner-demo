import { CATEGORIES, PRODUCTS } from './catalog-data.js';
import {
  getProductConfiguration,
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
} from './product-config.js';

const normalizeSearch = (value) =>
  String(value || '').trim().toLocaleLowerCase('ru-RU');

export const getCategoryProductIds = (categoryId, products = PRODUCTS) =>
  products
    .filter(({ category }) => category === categoryId)
    .map(({ id }) => id);

export const buildCategorySummaries = ({
  categories = CATEGORIES,
  products = PRODUCTS,
  stoppedProductIds = [],
} = {}) => {
  const stopped = new Set(stoppedProductIds.map(String));
  return categories.map((category) => {
    const categoryProducts = products.filter(
      ({ category: productCategory }) => productCategory === category.id,
    );
    const stoppedCount = categoryProducts.filter(({ id }) => stopped.has(id)).length;
    return {
      ...category,
      products: categoryProducts,
      productCount: categoryProducts.length,
      stoppedCount,
      allAvailable: categoryProducts.length > 0 && stoppedCount === 0,
      allStopped: categoryProducts.length > 0 && stoppedCount === categoryProducts.length,
    };
  });
};

export const filterOwnerMenu = (categories, query) => {
  const normalized = normalizeSearch(query);
  if (!normalized) return categories;
  return categories
    .map((category) => {
      const categoryMatches = normalizeSearch(category.label).includes(normalized);
      const products = categoryMatches
        ? category.products
        : category.products.filter((product) =>
            [product.name, product.description]
              .some((value) => normalizeSearch(value).includes(normalized)),
          );
      return { ...category, products };
    })
    .filter((category) =>
      normalizeSearch(category.label).includes(normalized) || category.products.length > 0,
    );
};

const toOptions = (source, ids) =>
  ids.map((id) => ({ id, label: source[id]?.label || id, price: source[id]?.price || 0 }));
export const getGlobalMeatOptions = (settings = {}) => {
  const stopped = new Set(
    Array.isArray(settings.stoppedMeatIds)
      ? settings.stoppedMeatIds.map(String)
      : [],
  );
  return ['chicken', 'beef'].map((id) => ({
    id,
    label: MEAT_LABELS[id],
    available: !stopped.has(id),
  }));
};


export const getProductOptionGroups = (productId) => {
  const configuration = getProductConfiguration(productId);
  if (!configuration) return [];
  const groups = [];
  const meats = Object.keys(configuration.prices || {}).filter((id) => id !== 'default');
  if (meats.length > 1) {
    groups.push({
      kind: 'meat',
      label: 'Мясо',
      options: meats.map((id) => ({ id, label: MEAT_LABELS[id] || id, price: 0 })),
    });
  }
  if (configuration.addons?.length) {
    groups.push({
      kind: 'addon',
      label: 'Добавки',
      options: toOptions(PRODUCT_ADDONS, configuration.addons),
    });
  }
  if (configuration.sauces?.length) {
    groups.push({
      kind: 'sauce',
      label: 'Соусы',
      options: toOptions(PRODUCT_SAUCES, configuration.sauces),
    });
  }
  return groups;
};
