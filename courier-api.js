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

export const createCourierApi = ({
  baseUrl = '/api/courier',
  fetchImpl = globalThis.fetch,
} = {}) => ({
  login(pin) {
    return requestJson(fetchImpl, `${baseUrl}/session`, {
      method: 'POST',
      body: JSON.stringify({ pin: String(pin || '') }),
    });
  },
  logout() {
    return requestJson(fetchImpl, `${baseUrl}/session`, { method: 'DELETE' });
  },
  getOrders() {
    return requestJson(fetchImpl, `${baseUrl}/orders`, { method: 'GET' });
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
      if (String(pin || '') !== '5724') {
        throw new CourierApiError('Неверный PIN', 401);
      }
      session = true;
      return { courier: { name: 'Курьер' } };
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
