import { sanitizeCartLines } from './cart-security.js?v=2026090101';

export const CART_STORAGE_KEY = 'pivnoy-doner-cart-v1';

const getBrowserStorage = () =>
  typeof window !== 'undefined' ? window.localStorage : null;

export const loadCart = (storage = getBrowserStorage()) => {
  if (!storage?.getItem) return [];

  try {
    const parsed = JSON.parse(storage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? sanitizeCartLines(parsed) : [];
  } catch {
    return [];
  }
};

export const saveCart = (storage = getBrowserStorage(), lines = []) => {
  const safeLines = sanitizeCartLines(lines);
  if (!storage?.setItem) return safeLines;

  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(safeLines));
  } catch {
    return safeLines;
  }

  return safeLines;
};

export const updateStoredCart = (
  storage = getBrowserStorage(),
  updater = (lines) => lines,
) => {
  const next = updater(loadCart(storage));
  return saveCart(storage, Array.isArray(next) ? next : []);
};
