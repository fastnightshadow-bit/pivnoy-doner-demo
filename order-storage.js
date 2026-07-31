import { normalizeOrder } from './order-state.js';

export const ACTIVE_ORDER_STORAGE_KEY = 'pivnoy-doner-active-order-v1';

const getBrowserStorage = () =>
  typeof window !== 'undefined' ? window.localStorage : null;

export const loadActiveOrder = (storage = getBrowserStorage()) => {
  if (!storage?.getItem) return null;

  try {
    return normalizeOrder(
      JSON.parse(storage.getItem(ACTIVE_ORDER_STORAGE_KEY) || 'null'),
    );
  } catch {
    return null;
  }
};

export const saveActiveOrder = (
  storage = getBrowserStorage(),
  order = null,
) => {
  const normalized = normalizeOrder(order);
  if (!normalized || !storage?.setItem) return normalized;

  try {
    storage.setItem(ACTIVE_ORDER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    return normalized;
  }

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
