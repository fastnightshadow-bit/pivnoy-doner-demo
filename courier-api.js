import { createDemoOrders } from './kitchen-fixtures.js?v=2026081407';
import { normalizeCourierOrder } from './courier-state.js?v=2026081407';

const wait = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export class CourierApiError extends Error {
  constructor(message, status = 0, code = '', details = null) {
    super(message);
    this.name = 'CourierApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const requestJson = async (fetchImpl, url, options = {}) => {
  const response = await fetchImpl(url, {
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CourierApiError(
      payload.message || 'Не удалось выполнить действие',
      response.status,
      payload.error || '',
      payload.details || null,
    );
  }
  return payload;
};

export const normalizeProductionCourierOrder = (order = {}) => {
  const createdAt = Date.parse(order.createdAt ?? order.created_at ?? '');
  const etaMax = Number(order.eta?.max ?? order.eta_max) || 12;
  return {
    id: order.id,
    number: String(order.number ?? order.public_number ?? ''),
    fulfillment: order.fulfillment,
    paymentStatus:
      (order.paymentStatus ?? order.payment_status) === 'paid'
        ? 'succeeded'
        : order.paymentStatus ?? order.payment_status,
    status: order.status === 'courier' ? 'handed_to_courier' : order.status,
    promisedAt: Number.isFinite(createdAt)
      ? new Date(createdAt + etaMax * 60000).toISOString()
      : '',
    phone: order.phone || '',
    customer: {
      phone: order.phone || '',
    },
    address: order.address || {},
    version: Number(order.version) || 1,
  };
};

export const createCourierApi = ({
  baseUrl = '/api',
  fetchImpl = globalThis.fetch,
  eventSourceFactory = (url) => new EventSource(url),
} = {}) => ({
  async getSession() {
    const session = await requestJson(fetchImpl, `${baseUrl}/auth/session`);
    if (!session?.authenticated || !session.account) return null;
    if (!['courier', 'owner'].includes(session.account.role)) return null;
    return {
      courier: { name: session.account.displayName || 'Курьер' },
    };
  },

  async login(pin) {
    await requestJson(fetchImpl, `${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ role: 'courier', pin: String(pin || '') }),
    });
    return this.getSession();
  },
  logout() {
    return requestJson(fetchImpl, `${baseUrl}/auth/logout`, { method: 'POST' });
  },
  async getOrders() {
    const response = await requestJson(fetchImpl, `${baseUrl}/staff/orders`, {
      method: 'GET',
    });
    return {
      orders: (response.orders || []).map(normalizeProductionCourierOrder),
      serverTime: new Date().toISOString(),
    };
  },
  changeStatus(orderId, status, version) {
    return requestJson(
      fetchImpl,
      `${baseUrl}/staff/orders/${encodeURIComponent(orderId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, version }),
      },
    );
  },

  subscribe(onEvent, onConnection = () => {}) {
    const source = eventSourceFactory(`${baseUrl}/events?scope=staff`);
    source.onopen = () => onConnection(true);
    source.onerror = () => onConnection(false);
    [
      'order.created',
      'order.updated',
      'order.cancelled',
      'payment.updated',
    ].forEach((type) =>
      source.addEventListener?.(type, (event) => {
        try {
          onEvent({
            type: 'sync.required',
            sourceType: type,
            payload: JSON.parse(event.data),
          });
        } catch {
          onConnection(false);
        }
      }),
    );
    return () => source.close();
  },
});

export const createDemoCourierApi = ({
  now = () => Date.now(),
  delay = () => wait(160),
} = {}) => {
  let session = false;
  const listeners = new Set();
  let orders = createDemoOrders(now()).map((order) => ({
    ...order,
    version: Math.max(1, Number(order.version) || 1),
  }));

  return {
    async getSession() {
      return session ? { courier: { name: 'Павел' } } : null;
    },

    async login(pin) {
      await delay();
      if (String(pin || '') !== '0000') {
        throw new CourierApiError('Неверный PIN', 401);
      }
      session = true;
      return { courier: { name: 'Павел' } };
    },
    async logout() {
      session = false;
      return {};
    },
    async getOrders() {
      if (!session) throw new CourierApiError('Введите PIN', 401);
      await delay();
      const visibleOrders = orders.filter((order) =>
        Boolean(normalizeCourierOrder(order)),
      );
      return { orders: visibleOrders, serverTime: new Date(now()).toISOString() };
    },
    async changeStatus(orderId, status, version) {
      if (!session) throw new CourierApiError('Введите PIN', 401);
      await delay();
      const index = orders.findIndex(({ id }) => id === orderId);
      if (index < 0) throw new CourierApiError('Заказ не найден', 404);
      const current = orders[index];
      if (Number(version) !== Number(current.version)) {
        throw new CourierApiError('Заказ уже изменился. Обновите список.', 409);
      }
      const allowed =
        (current.status === 'ready' && status === 'courier') ||
        (current.status === 'handed_to_courier' && status === 'completed');
      if (!allowed) throw new CourierApiError('Этот статус уже нельзя изменить', 422);
      const order = {
        ...current,
        status: status === 'courier' ? 'handed_to_courier' : status,
        version: Number(current.version) + 1,
      };
      orders[index] = order;
      for (const listener of listeners) {
        listener({ type: 'sync.required', sourceType: 'order.updated' });
      }
      return { order };
    },

    subscribe(onEvent, onConnection = () => {}) {
      listeners.add(onEvent);
      queueMicrotask(() => onConnection(true));
      return () => listeners.delete(onEvent);
    },
  };
};

export const isCourierDemoLocation = (locationLike = {}) => {
  const hostname = String(locationLike.hostname || '');
  const search = new URLSearchParams(String(locationLike.search || ''));
  return hostname === 'localhost' || hostname === '127.0.0.1' || search.get('demo') === '1';
};
