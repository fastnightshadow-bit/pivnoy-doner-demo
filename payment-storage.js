export const PAYMENT_STORAGE_KEY = 'pivnoy-doner-payment-v1';

const normalizePayment = (value) => (value === 'sbp' ? 'sbp' : 'card');

export const loadPayment = (storage = globalThis.localStorage) => {
  try {
    return normalizePayment(storage?.getItem?.(PAYMENT_STORAGE_KEY));
  } catch {
    return 'card';
  }
};

export const savePayment = (
  storage = globalThis.localStorage,
  value = 'card',
) => {
  const payment = normalizePayment(value);
  try {
    storage?.setItem?.(PAYMENT_STORAGE_KEY, payment);
  } catch {
    // Payment choice remains available for the current checkout session.
  }
  return payment;
};
