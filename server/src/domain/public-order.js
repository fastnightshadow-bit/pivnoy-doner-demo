import { PRODUCT_ADDONS, PRODUCT_SAUCES } from '../../../shared/catalog.js';

const SAFE_MEATS = new Set(['default', 'chicken', 'beef']);
const SAFE_SIZES = new Set(['single', 'standard', 'giant']);
const SAFE_ADDONS = new Set(Object.keys(PRODUCT_ADDONS));
const SAFE_SAUCES = new Set(Object.keys(PRODUCT_SAUCES));

const getConfiguration = (item) =>
  item?.configuration &&
  typeof item.configuration === 'object' &&
  !Array.isArray(item.configuration)
    ? item.configuration
    : {};

const getSafeOptionId = (value, allowed) =>
  typeof value === 'string' && allowed.has(value) ? value : undefined;

const getSafeQuantities = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value)
    .filter(
      ([id, quantity]) =>
        allowed.has(id) &&
        Number.isInteger(quantity) &&
        quantity >= 1 &&
        quantity <= 5,
    )
    .sort(([left], [right]) => left.localeCompare(right, 'en'));
  return entries.length > 0 ? Object.fromEntries(entries) : {};
};

const toPublicClientItem = (item = {}) => {
  const configuration = getConfiguration(item);
  return {
    lineId: item.lineId,
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    meat: getSafeOptionId(item.meat ?? configuration.meat, SAFE_MEATS),
    size: getSafeOptionId(item.size ?? configuration.size, SAFE_SIZES),
    addons: getSafeQuantities(item.addons ?? configuration.addons, SAFE_ADDONS),
    sauces: getSafeQuantities(item.sauces ?? configuration.sauces, SAFE_SAUCES),
  };
};

export const toPublicClientOrder = (order = {}) => ({
  id: order.id,
  number: order.number,
  status: order.status,
  paymentStatus: order.paymentStatus,
  fulfillment: order.fulfillment,
  itemsTotal: order.itemsTotal,
  deliveryTotal: order.deliveryTotal,
  discountTotal: order.discountTotal,
  total: order.total,
  eta: order.eta,
  createdAt: order.createdAt,
  items: (Array.isArray(order.items) ? order.items : []).map(toPublicClientItem),
});
