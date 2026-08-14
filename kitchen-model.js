export const KITCHEN_STATUSES = Object.freeze([
  'new',
  'accepted',
  'cooking',
  'ready',
]);

export const KITCHEN_COLUMNS = Object.freeze([
  Object.freeze({ id: 'new', label: 'Новые' }),
  Object.freeze({ id: 'accepted', label: 'Приняты' }),
  Object.freeze({ id: 'cooking', label: 'Готовятся' }),
  Object.freeze({ id: 'ready', label: 'Готовы' }),
]);

export const CANCELLATION_REASONS = Object.freeze([
  Object.freeze({
    id: 'customer_request',
    label: 'Клиент попросил отменить',
  }),
  Object.freeze({ id: 'missing_ingredient', label: 'Нет ингредиента' }),
  Object.freeze({ id: 'duplicate', label: 'Дублирующий заказ' }),
  Object.freeze({ id: 'technical', label: 'Техническая проблема' }),
  Object.freeze({ id: 'other', label: 'Другая причина' }),
]);

const NEXT_ACTION = Object.freeze({
  new: Object.freeze({ status: 'accepted', label: 'Принять заказ' }),
  accepted: Object.freeze({ status: 'cooking', label: 'Начать готовить' }),
  cooking: Object.freeze({ status: 'ready', label: 'Заказ готов' }),
});

const toText = (value) => String(value ?? '').trim();

const toNonNegativeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

const normalizeHistory = (history) =>
  Array.isArray(history)
    ? history.map((entry) => ({
        from: toText(entry?.from),
        to: toText(entry?.to),
        employee: toText(entry?.employee),
        at: toText(entry?.at),
        reason: toText(entry?.reason),
      }))
    : [];

const normalizeItems = (items) =>
  Array.isArray(items)
    ? items.map((item, index) => ({
        id: toText(item?.id) || `item-${index + 1}`,
        name: toText(item?.name) || 'Блюдо',
        quantity: Math.max(1, Math.floor(toNonNegativeNumber(item?.quantity))),
        options: Array.isArray(item?.options)
          ? item.options.map(toText).filter(Boolean)
          : [],
        comment: toText(item?.comment),
      }))
    : [];

export const getNextKitchenAction = (order = {}) => {
  if (order.status === 'ready') {
    return order.fulfillment === 'delivery'
      ? null
      : { status: 'issued', label: 'Выдан клиенту' };
  }

  return NEXT_ACTION[order.status] ? { ...NEXT_ACTION[order.status] } : null;
};

export const getUrgency = (order, nowMs = Date.now()) => {
  const promisedAt = Date.parse(order?.promisedAt || '');
  const remainingMs = promisedAt - nowMs;

  if (!Number.isFinite(remainingMs)) {
    return { tone: 'normal', label: 'Без срока' };
  }

  const minutes = Math.ceil(Math.abs(remainingMs) / 60000);
  if (remainingMs < 0) {
    return { tone: 'overdue', label: `Просрочен на ${minutes} мин` };
  }
  if (remainingMs <= 10 * 60000) {
    return { tone: 'warning', label: `Осталось ${minutes} мин` };
  }
  return { tone: 'normal', label: `Осталось ${minutes} мин` };
};

export const normalizeKitchenOrder = (value, nowMs = Date.now()) => {
  if (!value || typeof value !== 'object') return null;

  const id = toText(value.id);
  const number = toText(value.number);
  const status = toText(value.status);
  const createdAt = toText(value.createdAt);
  if (
    !id ||
    !number ||
    !KITCHEN_STATUSES.includes(status) ||
    value.paymentStatus !== 'succeeded' ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return null;
  }

  const createdAtMs = Date.parse(createdAt);
  const fulfillment = value.fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const normalized = {
    id,
    number,
    status,
    paymentStatus: 'succeeded',
    fulfillment,
    createdAt: new Date(createdAtMs).toISOString(),
    promisedAt: toText(value.promisedAt),
    acceptedAt: toText(value.acceptedAt),
    customer: {
      name: toText(value.customer?.name),
      phone: toText(value.customer?.phone),
    },
    address:
      value.address && typeof value.address === 'object'
        ? {
            street: toText(value.address.street),
            entrance: toText(value.address.entrance),
            floor: toText(value.address.floor),
            apartment: toText(value.address.apartment),
            intercom: toText(value.address.intercom),
          }
        : null,
    items: normalizeItems(value.items),
    comment: toText(value.comment),
    total: toNonNegativeNumber(value.total),
    employee: toText(value.employee),
    history: normalizeHistory(value.history),
    waitMinutes: Math.max(0, Math.ceil((nowMs - createdAtMs) / 60000)),
  };

  normalized.urgency = getUrgency(normalized, nowMs);
  return normalized;
};

export const groupKitchenOrders = (
  orders,
  {
    query = '',
    fulfillment = 'all',
    urgency = 'all',
    nowMs = Date.now(),
  } = {},
) => {
  const groups = {
    new: [],
    accepted: [],
    cooking: [],
    ready: [],
  };
  const normalizedQuery = toText(query).toLowerCase();

  for (const rawOrder of Array.isArray(orders) ? orders : []) {
    const order = normalizeKitchenOrder(rawOrder, nowMs);
    if (!order) continue;
    if (normalizedQuery && !order.number.toLowerCase().includes(normalizedQuery)) {
      continue;
    }
    if (fulfillment !== 'all' && order.fulfillment !== fulfillment) continue;
    if (urgency !== 'all' && order.urgency.tone !== urgency) continue;
    groups[order.status].push(order);
  }

  for (const column of Object.values(groups)) {
    column.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  return groups;
};

export const createStatusHistoryEntry = ({
  from,
  to,
  employee,
  at,
  reason = '',
}) =>
  Object.freeze({
    from: toText(from),
    to: toText(to),
    employee: toText(employee),
    at: new Date(at).toISOString(),
    reason: toText(reason),
  });
