import { normalizeOrder } from './order-state.js';

export const ACTIVE_ORDER_STORAGE_KEY = 'pivnoy-doner-active-order-v1';
export const ACTIVE_ORDER_ID_STORAGE_KEY = 'pivnoy-doner-active-order-id-v1';
export const ACTIVE_ORDER_ACCESS_STORAGE_KEY =
  'pivnoy-doner-active-order-access-v1';

const getBrowserStorage = () =>
  typeof window !== 'undefined' ? window.localStorage : null;

const minimizeStoredOrder = (order) => {
  const normalized = normalizeOrder(order);
  if (!normalized) return null;

  return normalizeOrder({
    ...normalized,
    customerName: '',
    phone: '',
    address: {},
    comment: '',
    items: normalized.items.map((item) => ({ ...item, comment: '' })),
  });
};

export const loadActiveOrder = (storage = getBrowserStorage()) => {
  if (!storage?.getItem) return null;

  let order;
  try {
    order = minimizeStoredOrder(
      JSON.parse(storage.getItem(ACTIVE_ORDER_STORAGE_KEY) || 'null'),
    );
  } catch {
    return null;
  }

  if (order) {
    try {
      storage.setItem?.(ACTIVE_ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch {
      // The safe in-memory order remains usable when migration cannot persist.
    }
  }
  return order;
};

export const saveActiveOrder = (
  storage = getBrowserStorage(),
  order = null,
) => {
  const normalized = minimizeStoredOrder(order);
  if (!normalized || !storage?.setItem) return normalized;

  try {
    storage.setItem(ACTIVE_ORDER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    return normalized;
  }

  return normalized;
};

export const loadActiveOrderId = (storage = getBrowserStorage()) => {
  if (!storage?.getItem) return '';
  return String(storage.getItem(ACTIVE_ORDER_ID_STORAGE_KEY) || '').trim();
};

export const saveActiveOrderId = (
  storage = getBrowserStorage(),
  orderId = '',
) => {
  const normalized = String(orderId || '').trim();
  if (!storage?.setItem) return normalized;
  if (normalized) storage.setItem(ACTIVE_ORDER_ID_STORAGE_KEY, normalized);
  else storage.removeItem?.(ACTIVE_ORDER_ID_STORAGE_KEY);
  return normalized;
};

const normalizeActiveOrderAccess = (value) => {
  const id = String(value?.id || '').trim();
  const token = String(value?.token || '').trim();
  return id && token ? { id, token } : null;
};

export const loadActiveOrderAccess = (storage = getBrowserStorage()) => {
  if (!storage?.getItem) return null;
  try {
    return normalizeActiveOrderAccess(
      JSON.parse(storage.getItem(ACTIVE_ORDER_ACCESS_STORAGE_KEY) || 'null'),
    );
  } catch {
    return null;
  }
};

export const saveActiveOrderAccess = (
  storage = getBrowserStorage(),
  access = null,
) => {
  const normalized = normalizeActiveOrderAccess(access);
  if (!normalized) throw new Error('active-order-access-invalid');
  if (!storage?.setItem) {
    throw new Error('active-order-access-storage-unavailable');
  }
  storage.setItem(
    ACTIVE_ORDER_ACCESS_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  return normalized;
};

export const subscribeToActiveOrder = (windowRef, callback) => {
  const listener = (event) => {
    if (event.key === ACTIVE_ORDER_STORAGE_KEY) {
      callback(loadActiveOrder(windowRef?.localStorage));
    }
  };

  windowRef?.addEventListener?.('storage', listener);
  return () => windowRef?.removeEventListener?.('storage', listener);
};
