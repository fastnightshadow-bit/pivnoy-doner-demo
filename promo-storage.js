import { PROMO_CODE, normalizePromoCode } from './promo-state.js';

export const PROMO_STORAGE_KEY = 'pivnoy-doner-promo-v1';

const getBrowserStorage = () =>
  typeof window === 'undefined' ? null : window.localStorage;

export const loadPromo = (storage = getBrowserStorage()) => {
  if (!storage?.getItem) return '';
  try {
    const code = normalizePromoCode(storage.getItem(PROMO_STORAGE_KEY));
    return code === PROMO_CODE ? code : '';
  } catch {
    return '';
  }
};

export const clearPromo = (storage = getBrowserStorage()) => {
  try {
    storage?.removeItem?.(PROMO_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private browsing; the order still works.
  }
};

export const savePromo = (storage = getBrowserStorage(), value = '') => {
  const code = normalizePromoCode(value);
  if (code !== PROMO_CODE) {
    clearPromo(storage);
    return '';
  }

  try {
    storage?.setItem?.(PROMO_STORAGE_KEY, code);
    return code;
  } catch {
    return '';
  }
};
