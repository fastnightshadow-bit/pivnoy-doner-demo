import { PRODUCT_ADDONS, PRODUCT_SAUCES } from '../../../shared/catalog.js';

const SAFE_ADDONS = new Set(Object.keys(PRODUCT_ADDONS));
const SAFE_SAUCES = new Set(Object.keys(PRODUCT_SAUCES));
const SAFE_MEATS = new Set(['default', 'chicken', 'beef']);
const SAFE_SIZES = new Set(['single', 'standard', 'giant']);

const safeString = (value) => String(value ?? '');

const safeOption = (value, allowed) => {
  const normalized = safeString(value);
  return allowed.has(normalized) ? normalized : '';
};

const safeQuantities = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, quantity]) =>
        allowed.has(id) &&
        Number.isInteger(quantity) &&
        quantity >= 1 &&
        quantity <= 5,
    ),
  );
};

const toStaffAddress = (value) => {
  const address = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  return {
    street: safeString(address.street),
    entrance: safeString(address.entrance),
    floor: safeString(address.floor),
    apartment: safeString(address.apartment),
    intercom: safeString(address.intercom),
  };
};

const toStaffItem = (item = {}) => {
  const configuration =
    item.configuration &&
    typeof item.configuration === 'object' &&
    !Array.isArray(item.configuration)
      ? item.configuration
      : {};
  return {
    id: item.id ?? item.lineId,
    productId: item.productId ?? item.product_id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? item.unit_price,
    configuration: {
      meat: safeOption(item.meat ?? configuration.meat, SAFE_MEATS),
      size: safeOption(item.size ?? configuration.size, SAFE_SIZES),
      addons: safeQuantities(
        item.addons ?? configuration.addons,
        SAFE_ADDONS,
      ),
      sauces: safeQuantities(
        item.sauces ?? configuration.sauces,
        SAFE_SAUCES,
      ),
    },
  };
};

const toStaffHistoryEntry = (entry = {}) => ({
  from: entry.from ?? entry.previous_status ?? '',
  to: entry.to ?? entry.new_status ?? '',
  employee: entry.employee ?? entry.actor_name ?? '',
  at: entry.at ?? entry.created_at ?? '',
  reason: entry.reason ?? '',
});

export const toStaffOrder = (order = {}) => ({
  id: order.id,
  number: String(order.number ?? order.public_number ?? ''),
  status: order.status,
  paymentStatus: order.paymentStatus ?? order.payment_status,
  fulfillment: order.fulfillment,
  customerName: order.customerName ?? order.customer_name ?? '',
  phone: order.phone ?? '',
  address: toStaffAddress(order.address),
  comment: order.comment ?? order.customer_comment ?? '',
  courierComment: order.courierComment ?? order.courier_comment ?? '',
  itemsTotal: order.itemsTotal ?? order.items_total,
  deliveryTotal: order.deliveryTotal ?? order.delivery_total,
  discountTotal: order.discountTotal ?? order.discount_total,
  total: order.total,
  eta: order.eta ?? {
    min: order.eta_min,
    max: order.eta_max,
  },
  version: order.version,
  createdAt: order.createdAt ?? order.created_at,
  updatedAt: order.updatedAt ?? order.updated_at,
  items: (Array.isArray(order.items) ? order.items : []).map(toStaffItem),
  history: (Array.isArray(order.history) ? order.history : []).map(
    toStaffHistoryEntry,
  ),
});
