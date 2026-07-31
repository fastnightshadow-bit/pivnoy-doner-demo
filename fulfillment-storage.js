export const FULFILLMENT_STORAGE_KEY = 'pivnoy-doner-fulfillment-v1';

const normalizeFulfillment = (value) =>
  value === 'delivery' ? 'delivery' : 'pickup';

export const loadFulfillment = (
  storage = typeof window !== 'undefined' ? window.localStorage : null,
) => {
  if (!storage?.getItem) return 'pickup';
  try {
    return normalizeFulfillment(storage.getItem(FULFILLMENT_STORAGE_KEY));
  } catch {
    return 'pickup';
  }
};

export const saveFulfillment = (
  storage,
  value,
) => {
  const fulfillment = normalizeFulfillment(value);
  try {
    storage?.setItem?.(FULFILLMENT_STORAGE_KEY, fulfillment);
  } catch {
    // Storage can be unavailable in private browsing. The UI still works.
  }
  return fulfillment;
};
