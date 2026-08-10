import {
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  normalizeOptionQuantities,
  PRODUCTS,
} from '../../../shared/catalog.js';
import { calculateDelivery, DEFAULT_ORDER_SETTINGS } from './delivery.js';
import { DomainError } from './errors.js';

const productsById = new Map(PRODUCTS.map((product) => [product.id, product]));

const normalizeQuantity = (value) => {
  const quantity = Math.floor(Number(value) || 0);
  if (quantity < 1 || quantity > 20) {
    throw new DomainError('INVALID_QUANTITY');
  }
  return quantity;
};

const priceLine = (input = {}) => {
  const productId = String(input.productId ?? '');
  const product = productsById.get(productId);
  if (!product) throw new DomainError('UNKNOWN_PRODUCT', { productId });

  const meats = getAvailableMeats(productId);
  const meat = meats.includes(input.meat) ? input.meat : meats[0];
  const sizes = getAvailableSizes(productId, meat);
  const size = sizes.includes(input.size) ? input.size : sizes[0];
  const addons = normalizeOptionQuantities(input.addons);
  const sauces = normalizeOptionQuantities(input.sauces);
  const unitPrice = calculateProductPrice(productId, {
    meat,
    size,
    addons,
    sauces,
  });

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new DomainError('PRODUCT_NOT_SALEABLE', { productId });
  }

  return Object.freeze({
    productId,
    name: product.name,
    quantity: normalizeQuantity(input.quantity),
    unitPrice,
    configuration: Object.freeze({ meat, size, addons, sauces }),
  });
};

export const priceOrder = (
  input = {},
  settings = DEFAULT_ORDER_SETTINGS,
) => {
  const fulfillment = input.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const sourceItems = Array.isArray(input.items) ? input.items : [];
  if (sourceItems.length === 0 || sourceItems.length > 50) {
    throw new DomainError('INVALID_ITEMS');
  }

  const items = sourceItems.map(priceLine);
  const itemsTotal = items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0,
  );
  const deliveryTotal = calculateDelivery(itemsTotal, fulfillment, settings);
  const discountTotal = 0;

  return Object.freeze({
    fulfillment,
    items,
    itemsTotal,
    deliveryTotal,
    discountTotal,
    total: itemsTotal + deliveryTotal - discountTotal,
  });
};
