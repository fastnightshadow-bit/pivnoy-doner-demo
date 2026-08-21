import {
  CATEGORIES,
  PRODUCTS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
} from '../../../shared/catalog.js';

const productsById = new Map(PRODUCTS.map((product) => [product.id, product]));
const categoriesById = new Set(CATEGORIES.map(({ id }) => id));
const allowedOptions = Object.freeze({
  meat: new Set(['chicken', 'beef']),
  sauce: new Set(Object.keys(PRODUCT_SAUCES)),
  addon: new Set(Object.keys(PRODUCT_ADDONS)),
});

export const createSettingsService = ({ settings }) => ({
  get: () => settings.get(),
  update: async (value, account) => {
    await settings.update(value, account);
    return settings.get();
  },
  setAvailability: async (productId, available, account) => {
    const product = productsById.get(String(productId));
    if (!product) {
      const error = new Error('PRODUCT_NOT_FOUND');
      error.code = 'PRODUCT_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    await settings.setAvailability(product, available, account);
    return { productId: product.id, available: Boolean(available) };
  },
  setCategoryAvailability: async (categoryId, available, account) => {
    const normalizedCategoryId = String(categoryId);
    if (!categoriesById.has(normalizedCategoryId)) {
      const error = new Error('CATEGORY_NOT_FOUND');
      error.code = 'CATEGORY_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    const products = PRODUCTS.filter(({ category }) => category === normalizedCategoryId);
    await settings.setCategoryAvailability(
      normalizedCategoryId,
      products,
      Boolean(available),
      account,
    );
    return {
      categoryId: normalizedCategoryId,
      productIds: products.map(({ id }) => id),
      available: Boolean(available),
    };
  },
  setOptionAvailability: async (kind, optionId, available, account) => {
    const normalizedKind = String(kind);
    const normalizedOptionId = String(optionId);
    if (!allowedOptions[normalizedKind]?.has(normalizedOptionId)) {
      const error = new Error('OPTION_NOT_FOUND');
      error.code = 'OPTION_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    await settings.setOptionAvailability(
      normalizedKind,
      normalizedOptionId,
      Boolean(available),
      account,
    );
    return {
      kind: normalizedKind,
      optionId: normalizedOptionId,
      available: Boolean(available),
    };
  },
});
