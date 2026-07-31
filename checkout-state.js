import { calculateCartSummary } from './cart-state.js';
import { getPromoDiscount } from './promo-state.js';

export const formatPhoneInput = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith('7')) digits = `7${digits}`;
  digits = digits.slice(0, 11);

  const local = digits.slice(1);
  let result = '+7';
  if (local.length) result += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) result += ')';
  if (local.length > 3) result += ` ${local.slice(3, 6)}`;
  if (local.length > 6) result += `-${local.slice(6, 8)}`;
  if (local.length > 8) result += `-${local.slice(8, 10)}`;
  return result;
};

export const isCompletePhone = (value) =>
  /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(String(value ?? ''));

export const normalizeDeliveryAddress = (data = {}) => {
  const source =
    typeof data === 'string'
      ? { street: data }
      : data && typeof data === 'object'
        ? data
        : {};

  return {
    street: String(source.street || '').trim(),
    entrance: String(source.entrance || '').trim(),
    floor: String(source.floor || '').trim(),
    apartment: String(source.apartment || '').trim(),
    intercom: String(source.intercom || '').trim(),
  };
};

export const validateCheckout = (data = {}) => {
  const errors = {};
  if (!isCompletePhone(data.phone)) {
    errors.phone = 'Введите телефон полностью';
  }
  if (
    data.fulfillment === 'delivery' &&
    !normalizeDeliveryAddress(data.address).street
  ) {
    errors.address = 'Укажите адрес доставки';
  }
  if (data.timeMode === 'scheduled' && !data.selectedTime) {
    errors.selectedTime = 'Выберите время';
  }
  return errors;
};

export const getCheckoutFieldOrder = (fulfillment, timeMode = 'asap') => {
  const fields =
    fulfillment === 'delivery' ? ['address', 'phone'] : ['phone'];
  return timeMode === 'scheduled' ? [...fields, 'selectedTime'] : fields;
};

export const createTimeSlots = (now = new Date(), count = 6) => {
  const firstSlot = new Date(now);
  firstSlot.setSeconds(0, 0);
  firstSlot.setMinutes(firstSlot.getMinutes() + 15);
  const remainder = firstSlot.getMinutes() % 15;
  if (remainder) firstSlot.setMinutes(firstSlot.getMinutes() + 15 - remainder);

  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const slot = new Date(firstSlot);
    slot.setMinutes(slot.getMinutes() + index * 15);
    return slot.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  });
};

export const createCheckoutSummary = (lines, promoCode = '') => {
  const baseSummary = calculateCartSummary(lines, 0, 0);
  return calculateCartSummary(
    lines,
    0,
    getPromoDiscount(promoCode, baseSummary.items),
  );
};
