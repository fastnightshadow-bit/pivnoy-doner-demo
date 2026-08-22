import { createKioskBootstrapFixture } from './kiosk-fixtures.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class KioskApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'KioskApiError';
    this.status = status;
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
    async getBootstrap() {
      await delay();
      return createKioskBootstrapFixture({ serverTime: serverTime() });
    },

    createOrder(payload, operationId) {
      return runOnce(operationId, async () => {
        await delay();
        const lines = Array.isArray(payload?.lines) ? payload.lines : [];
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
          fulfillment: String(payload?.fulfillment || ''),
          lines: clone(lines),
          createdAt,
        };
        orderSequence += 1;
        return { order, serverTime: createdAt };
      });
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
