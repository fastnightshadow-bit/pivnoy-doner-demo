import { PRODUCTS } from '../../../shared/catalog.js';

const productsById = new Map(PRODUCTS.map((product) => [product.id, product]));

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
});
