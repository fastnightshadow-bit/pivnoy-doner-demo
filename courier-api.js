import { createDemoOrders } from './kitchen-fixtures.js';
import { normalizeCourierOrder } from './courier-state.js';

const wait = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export class CourierApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'CourierApiError';
    this.status = status;
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
    throw new CourierApiError(payload.message || 'Не удалось выполнить действие', response.status);
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
} = {}) => ({
  async login(pin) {
    await requestJson(fetchImpl, `${baseUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ role: 'courier', pin: String(pin || '') }),
    });
    const session = await requestJson(fetchImpl, `${baseUrl}/auth/session`);
    return { courier: { name: session.account?.displayName || 'Курьер' } };
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
});

export const createDemoCourierApi = ({
  now = () => Date.now(),
  delay = () => wait(160),
} = {}) => {
  let session = false;

  return {
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
      const orders = createDemoOrders(now()).filter((order) =>
        Boolean(normalizeCourierOrder(order)),
      );
      return { orders, serverTime: new Date(now()).toISOString() };
    },
  };
};

export const isCourierDemoLocation = (locationLike = {}) => {
  const hostname = String(locationLike.hostname || '');
  const search = new URLSearchParams(String(locationLike.search || ''));
  return hostname === 'localhost' || hostname === '127.0.0.1' || search.get('demo') === '1';
};
