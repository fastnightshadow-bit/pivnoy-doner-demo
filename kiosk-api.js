import { createKioskBootstrapFixture } from './kiosk-fixtures.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class KioskApiError extends Error {
  constructor(message, status = 0, code = 'API_ERROR') {
    super(message);
    this.name = 'KioskApiError';
    this.status = status;
    this.code = code;
  }
}

export const isKioskDemoLocation = (locationLike = {}) => {
  const hostname = String(locationLike.hostname || '');
  const search = new URLSearchParams(String(locationLike.search || ''));
  return ['localhost', '127.0.0.1'].includes(hostname) || search.get('demo') === '1';
};

const joinUrl = (baseUrl, path) =>
  `${String(baseUrl).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;

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
    throw new KioskApiError(
      payload.message || 'Не удалось выполнить действие',
      response.status,
      payload.error || 'API_ERROR',
    );
  }
  return payload;
};

export const createKioskApi = ({
  baseUrl = '/api/kiosk',
  fetchImpl = globalThis.fetch,
  eventSourceFactory = (url) => new EventSource(url),
} = {}) => {
  const jsonRequest = (path, options) =>
    requestJson(fetchImpl, joinUrl(baseUrl, path), options);

  return {
    activateDevice(code, displayName) {
      return jsonRequest('/activate', {
        method: 'POST',
        body: JSON.stringify({ code: String(code || ''), displayName: String(displayName || '') }),
      });
    },

    getSession() {
      return jsonRequest('/session', { method: 'GET' });
    },

    getBootstrap() {
      return jsonRequest('/bootstrap', { method: 'GET' });
    },

    createOrder(payload, operationId) {
      return jsonRequest('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': String(operationId || '') },
        body: JSON.stringify(payload || {}),
      });
    },

    getPaymentStatus(orderId) {
      return jsonRequest(`/orders/${encodeURIComponent(String(orderId || ''))}/payment`, {
        method: 'GET',
      });
    },

    subscribe(onEvent, onConnection = () => {}) {
      const source = eventSourceFactory(joinUrl(baseUrl, '/events'));
      source.onopen = () => onConnection(true);
      source.onerror = () => onConnection(false);
      source.onmessage = (event) => {
        try {
          onEvent(JSON.parse(event.data));
        } catch {
          onConnection(false);
        }
      };
      return () => source.close();
    },
  };
};

export const createDemoKioskApi = ({
  now = () => Date.now(),
  delay = () => wait(120),
} = {}) => {
  const operationResults = new Map();
  const listeners = new Set();
  const connectionListeners = new Set();
  let orderSequence = 24;

  const serverTime = () => new Date(now()).toISOString();
  const runOnce = (operationId, operation) => {
    const key = String(operationId || '');
    if (!key) {
      return Promise.reject(new KioskApiError('Нет ключа операции', 400));
    }
    if (operationResults.has(key)) return operationResults.get(key).then(clone);
    const pending = Promise.resolve().then(operation);
    operationResults.set(key, pending);
    return pending.then(clone);
  };

  return {
    async activateDevice() {
      return { authenticated: true, device: { id: 'demo-device', displayName: 'Демо-киоск' } };
    },

    async getSession() {
      return { authenticated: true, device: { id: 'demo-device', displayName: 'Демо-киоск' } };
    },

    async getBootstrap() {
      await delay();
      return createKioskBootstrapFixture({ serverTime: serverTime() });
    },

    createOrder(payload, operationId) {
      return runOnce(operationId, async () => {
        await delay();
        const lines = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.lines) ? payload.lines : [];
        const total = lines.reduce(
          (sum, line) =>
            sum +
            Math.max(0, Number(line.unitPrice) || 0) *
              Math.max(0, Math.floor(Number(line.quantity) || 0)),
          0,
        );
        const createdAt = serverTime();
        const order = {
          id: `demo-order-${orderSequence}`,
          number: String(orderSequence),
          status: 'pending_payment',
          total,
          fulfillment: String(payload?.serviceMode || payload?.fulfillment || ''),
          lines: clone(lines),
          createdAt,
        };
        orderSequence += 1;
        return {
          order,
          payment: { id: `demo-payment-${order.number}`, orderId: order.id, status: 'pending' },
          qrSvg: '<svg viewBox="0 0 21 21" aria-hidden="true"><rect width="21" height="21" fill="#fff"/><path d="M1 1h6v6H1zm13 0h6v6h-6zM1 14h6v6H1zm9-5h2v2h-2zm3 0h2v4h-2zm4 1h3v2h-3zm-8 4h4v2H9zm6 1h2v5h-2zm3 0h2v2h-2zm-9 4h4v2H9z" fill="#111"/></svg>',
          serverTime: createdAt,
        };
      });
    },

    async getPaymentStatus(orderId) {
      await delay();
      return { payment: { orderId, status: 'paid' }, serverTime: serverTime() };
    },

    subscribe(onEvent, onConnection = () => {}) {
      listeners.add(onEvent);
      connectionListeners.add(onConnection);
      queueMicrotask(() => onConnection(true));
      return () => {
        listeners.delete(onEvent);
        connectionListeners.delete(onConnection);
      };
    },
  };
};
