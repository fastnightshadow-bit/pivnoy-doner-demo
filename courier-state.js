export const COURIER_VISIBLE_STATUSES = Object.freeze([
  'accepted',
  'cooking',
  'ready',
  'handed_to_courier',
]);

const toText = (value) => String(value ?? '').trim();

const normalizeAddress = (value = {}) => ({
  street: toText(value.street),
  entrance: toText(value.entrance),
  floor: toText(value.floor),
  apartment: toText(value.apartment),
  intercom: toText(value.intercom),
});

export const normalizeCourierOrder = (order = {}) => {
  if (
    order.fulfillment !== 'delivery' ||
    order.paymentStatus !== 'succeeded' ||
    !COURIER_VISIBLE_STATUSES.includes(order.status)
  ) {
    return null;
  }

  const id = toText(order.id);
  const number = toText(order.number);
  const promisedAt = toText(order.promisedAt);
  const address = normalizeAddress(order.address);
  if (!id || !number || !address.street) return null;

  return {
    id,
    number,
    status: order.status,
    promisedAt,
    phone: toText(order.customer?.phone || order.phone),
    address,
  };
};

export const filterCourierOrders = (orders = []) =>
  (Array.isArray(orders) ? orders : [])
    .map(normalizeCourierOrder)
    .filter(Boolean)
    .sort((left, right) => {
      if (left.status === 'ready' && right.status !== 'ready') return -1;
      if (right.status === 'ready' && left.status !== 'ready') return 1;
      return Date.parse(left.promisedAt || '') - Date.parse(right.promisedAt || '');
    });

export const formatCourierAddress = (address = {}) =>
  [
    toText(address.street),
    address.entrance ? `подъезд ${toText(address.entrance)}` : '',
    address.floor ? `этаж ${toText(address.floor)}` : '',
    address.apartment ? `кв. ${toText(address.apartment)}` : '',
    address.intercom ? `домофон ${toText(address.intercom)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

export const sanitizeCourierPhone = (value) => {
  const source = toText(value);
  const digits = source.replace(/\D/g, '');
  if (digits.length < 10) return '';
  return `${source.startsWith('+') ? '+' : ''}${digits}`;
};

export const getCourierReadyLabel = (order = {}, now = new Date()) => {
  if (order.status === 'ready') return 'Можно забирать';
  if (order.status === 'handed_to_courier') return 'Заказ у вас';
  const promisedAt = Date.parse(order.promisedAt || '');
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(promisedAt) || !Number.isFinite(current)) {
    return 'Время уточняется';
  }
  const minutes = Math.ceil((promisedAt - current) / 60000);
  return minutes > 0
    ? `Будет готов через ${minutes} мин`
    : 'Должен быть готов';
};

export const getCourierStatusLabel = (status) =>
  ({
    accepted: 'Заказ принят',
    cooking: 'Готовится',
    ready: 'Готов',
    handed_to_courier: 'Передан вам',
  })[status] ?? 'Подтверждён';
