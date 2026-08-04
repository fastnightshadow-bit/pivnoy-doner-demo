export const DELIVERY_MINIMUM = 300;
export const DELIVERY_FEE = 200;
export const DELIVERY_FREE_FROM = 2000;
export const DELIVERY_OPEN_MINUTES = 11 * 60 + 30;
export const DELIVERY_CLOSE_MINUTES = 22 * 60 + 30;

const toSafeAmount = (value) => Math.max(0, Number(value) || 0);

export const getDeliveryFee = (itemsTotal, fulfillment = 'pickup') => {
  if (fulfillment !== 'delivery') return 0;
  return toSafeAmount(itemsTotal) >= DELIVERY_FREE_FROM ? 0 : DELIVERY_FEE;
};

export const getDeliveryMinimumRemaining = (
  itemsTotal,
  fulfillment = 'pickup',
) =>
  fulfillment === 'delivery'
    ? Math.max(0, DELIVERY_MINIMUM - toSafeAmount(itemsTotal))
    : 0;

export const isDeliveryOpen = (date = new Date()) => {
  const safeDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(safeDate.getTime())) return false;
  const minutes = safeDate.getHours() * 60 + safeDate.getMinutes();
  return minutes >= DELIVERY_OPEN_MINUTES && minutes <= DELIVERY_CLOSE_MINUTES;
};

export const DELIVERY_POLICY_LABELS = Object.freeze({
  hours: 'Ежедневно с 11:30 до 22:30',
  fee: 'Доставка 200 ₽',
  free: 'Бесплатно от 2 000 ₽',
  minimum: 'Минимальная сумма заказа 300 ₽',
});
