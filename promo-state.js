export const PROMO_CODE = 'ПИВНОЙДОНЕР';
export const PROMO_RATE = 0.05;

export const normalizePromoCode = (value) =>
  String(value ?? '')
    .trim()
    .toLocaleUpperCase('ru-RU')
    .replace(/[\s-]+/g, '');

export const getPromoDiscount = (code, itemsTotal) => {
  if (normalizePromoCode(code) !== PROMO_CODE) return 0;
  return Math.round(Math.max(0, Number(itemsTotal) || 0) * PROMO_RATE);
};

export const getPromoResult = (code, itemsTotal) => {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode) {
    return {
      status: 'empty',
      code: '',
      discount: 0,
      message: 'Введите промокод',
    };
  }

  const discount = getPromoDiscount(normalizedCode, itemsTotal);
  if (discount === 0) {
    return {
      status: 'invalid',
      code: '',
      discount: 0,
      message: 'Промокод не найден',
    };
  }

  return {
    status: 'applied',
    code: PROMO_CODE,
    discount,
    message: 'Промокод применён · скидка 5%',
  };
};
