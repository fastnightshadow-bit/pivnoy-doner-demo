import {
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  getProductConfiguration,
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

const resolveSelection = (value, allowedValues, productId, field) => {
  const hasExplicitValue = value !== undefined && value !== null && value !== '';
  if (!hasExplicitValue) return allowedValues[0];
  if (allowedValues.includes(value)) return value;
  throw new DomainError('INVALID_PRODUCT_CONFIGURATION', {
    productId,
    field,
    value: String(value),
  });
};

const normalizeAllowedOptions = (
  value,
  allowedOptionIds,
  productId,
  field,
) => {
  const rawOptionIds = Array.isArray(value)
    ? value.map(String)
    : Object.keys(value && typeof value === 'object' ? value : {});
  const allowed = new Set(allowedOptionIds);
  const invalidOptionIds = rawOptionIds.filter((id) => !allowed.has(id));
  if (invalidOptionIds.length > 0) {
    throw new DomainError('INVALID_PRODUCT_CONFIGURATION', {
      productId,
      field,
      optionIds: [...new Set(invalidOptionIds)].sort(),
    });
  }
  return normalizeOptionQuantities(value);
};

const priceLine = (input = {}) => {
  const productId = String(input.productId ?? '');
  const product = productsById.get(productId);
  if (!product) throw new DomainError('UNKNOWN_PRODUCT', { productId });

  const meats = getAvailableMeats(productId);
  const meat = resolveSelection(input.meat, meats, productId, 'meat');
  const sizes = getAvailableSizes(productId, meat);
  const size = resolveSelection(input.size, sizes, productId, 'size');
  const configuration = getProductConfiguration(productId);
  const addons = normalizeAllowedOptions(
    input.addons,
    configuration?.addons ?? [],
    productId,
    'addons',
  );
  const sauces = normalizeAllowedOptions(
    input.sauces,
    configuration?.sauces ?? [],
    productId,
    'sauces',
  );
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
  const totalQuantity = items.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  if (totalQuantity > 50) {
    throw new DomainError('INVALID_QUANTITY', { maximum: 50 });
  }
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

