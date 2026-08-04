export const ORDER_STATUSES = Object.freeze([
  'submitted',
  'accepted',
  'cooking',
  'ready',
  'courier',
  'delivered',
  'completed',
  'payment-failed',
]);

export const normalizeOrderStatus = (value) =>
  ORDER_STATUSES.includes(value) ? value : 'submitted';

const STATUS_STAGE = Object.freeze({
  submitted: 0,
  accepted: 1,
  cooking: 2,
  ready: 3,
  courier: 3,
  delivered: 3,
  completed: 3,
  'payment-failed': 0,
});

const toSafeNumber = (value) => Math.max(0, Number(value) || 0);
const toSafeString = (value) => String(value ?? '').trim();

const normalizeAddress = (value) => {
  if (typeof value === 'string') {
    return {
      street: toSafeString(value),
      entrance: '',
      floor: '',
      apartment: '',
      intercom: '',
    };
  }

  const source = value && typeof value === 'object' ? value : {};
  return {
    street: toSafeString(source.street),
    entrance: toSafeString(source.entrance),
    floor: toSafeString(source.floor),
    apartment: toSafeString(source.apartment),
    intercom: toSafeString(source.intercom),
  };
};

const normalizeEta = (value, fulfillment) => {
  const fallback =
    fulfillment === 'delivery'
      ? { min: 20, max: 30 }
      : { min: 5, max: 13 };
  if (!value || typeof value !== 'object') return fallback;

  const min = toSafeNumber(value.min);
  const max = Math.max(min, toSafeNumber(value.max));
  return min && max ? { min, max } : fallback;
};

const normalizeItem = (item = {}) => ({
  lineId: toSafeString(item.lineId),
  productId: toSafeString(item.productId),
  name: toSafeString(item.name) || 'Блюдо',
  quantity: Math.max(1, Number(item.quantity) || 1),
  unitPrice: toSafeNumber(item.unitPrice),
  meat: toSafeString(item.meat),
  size: toSafeString(item.size),
  sauce: toSafeString(item.sauce),
  addons: Array.isArray(item.addons)
    ? item.addons.map(toSafeString).filter(Boolean)
    : [],
  comment: toSafeString(item.comment),
  image: toSafeString(item.image),
  icon: toSafeString(item.icon),
});

export const normalizeOrder = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) {
    return null;
  }

  const id = toSafeString(value.id);
  const number = toSafeString(value.number);
  const createdAt = toSafeString(value.createdAt);
  if (!id || !number || !createdAt) return null;

  const fulfillment =
    value.fulfillment === 'delivery' ? 'delivery' : 'pickup';

  return {
    version: 1,
    id,
    number,
    createdAt,
    status: normalizeOrderStatus(value.status),
    fulfillment,
    payment: value.payment === 'sbp' ? 'sbp' : 'card',
    customerName: toSafeString(value.customerName),
    phone: toSafeString(value.phone),
    restaurantPhone: toSafeString(value.restaurantPhone),
    address: normalizeAddress(value.address),
    comment: toSafeString(value.comment),
    selectedTime: toSafeString(value.selectedTime),
    items: value.items.map(normalizeItem),
    itemsTotal: toSafeNumber(value.itemsTotal),
    delivery: toSafeNumber(value.delivery),
    discount: toSafeNumber(value.discount),
    total: toSafeNumber(value.total),
    eta: normalizeEta(value.eta, fulfillment),
  };
};

export const createOrderSnapshot = ({
  lines = [],
  summary = {},
  fulfillment = 'pickup',
  payment = 'card',
  customerName = '',
  phone = '',
  restaurantPhone = '',
  address = {},
  comment = '',
  selectedTime = '',
  eta,
  previousOrder = null,
  now = new Date(),
  random = Math.random,
} = {}) => {
  const createdAtDate =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const createdAt = createdAtDate.toISOString();
  const generatedNumber = String(
    Math.floor(Math.max(0, Math.min(0.9999, Number(random()) || 0)) * 10000),
  ).padStart(4, '0');

  return normalizeOrder({
    version: 1,
    id: toSafeString(previousOrder?.id) || `local-${createdAtDate.getTime()}`,
    number: toSafeString(previousOrder?.number) || generatedNumber,
    createdAt,
    status: 'submitted',
    fulfillment,
    payment,
    customerName,
    phone,
    restaurantPhone,
    address,
    comment,
    selectedTime,
    items: Array.isArray(lines) ? lines.map(normalizeItem) : [],
    itemsTotal: summary.items,
    delivery: summary.delivery,
    discount: summary.discount,
    total: summary.total,
    eta,
  });
};

const getFinalProgressLabel = (status, fulfillment) => {
  if (fulfillment === 'delivery') {
    if (status === 'delivered' || status === 'completed') return 'Доставлен';
    if (status === 'ready') return 'Готов';
    return 'В пути';
  }
  return status === 'completed' ? 'Выдан' : 'Готов';
};

export const getOrderProgress = (order = {}) => {
  const status = normalizeOrderStatus(order.status);
  const fulfillment =
    order.fulfillment === 'delivery' ? 'delivery' : 'pickup';

  return {
    activeIndex: STATUS_STAGE[status],
    labels: [
      'Оформлен',
      'Принят',
      'Готовится',
      getFinalProgressLabel(status, fulfillment),
    ],
  };
};

const formatEta = (order) => {
  const eta = normalizeEta(order?.eta, order?.fulfillment);
  return eta.min === eta.max
    ? `${eta.min} минут`
    : `${eta.min}–${eta.max} минут`;
};

export const getOrderPresentation = (order = {}) => {
  const status = normalizeOrderStatus(order.status);
  const fulfillment =
    order.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const eta = formatEta(order);

  const presentations = {
    submitted: {
      title: 'Заказ оформлен',
      message: 'Ожидаем подтверждения ресторана',
      tone: 'neutral',
      eta,
    },
    accepted: {
      title: 'Заказ принят',
      message:
        fulfillment === 'delivery'
          ? `Ориентировочно доставим через ${eta}`
          : `Ориентировочно будет готов через ${eta}`,
      tone: 'active',
      eta,
    },
    cooking: {
      title: 'Готовим ваш заказ',
      message:
        fulfillment === 'delivery'
          ? `Ориентировочно доставим через ${eta}`
          : `Ориентировочно будет готов через ${eta}`,
      tone: 'active',
      eta,
    },
    ready: {
      title: fulfillment === 'delivery' ? 'Заказ готов' : 'Можно забирать',
      message:
        fulfillment === 'delivery'
          ? 'Скоро передадим заказ курьеру'
          : 'Покажите номер заказа сотруднику',
      tone: 'success',
      eta: '',
    },
    courier: {
      title: 'Курьер в пути',
      message: `Ориентировочно доставим через ${eta}`,
      tone: 'active',
      eta,
    },
    delivered: {
      title: 'Заказ доставлен',
      message: 'Доставка завершена',
      tone: 'success',
      eta: '',
    },
    completed: {
      title: 'Заказ завершён',
      message: 'Спасибо за заказ',
      tone: 'success',
      eta: '',
    },
    'payment-failed': {
      title: 'Оплата не прошла',
      message: 'Заказ сохранён. Попробуйте оплатить ещё раз',
      tone: 'error',
      eta: '',
    },
  };

  return presentations[status];
};
