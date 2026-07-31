import {
  CANCELLATION_REASONS,
  createStatusHistoryEntry,
  getNextKitchenAction,
} from './kitchen-model.js';
import {
  createDemoEmployees,
  createDemoOrders,
} from './kitchen-fixtures.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class KitchenApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'KitchenApiError';
    this.status = status;
  }
}

export const isKitchenDemoHost = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1';

export const isKitchenDemoLocation = (locationLike = {}) => {
  const hostname = String(locationLike.hostname || '');
  const search = new URLSearchParams(String(locationLike.search || ''));
  return isKitchenDemoHost(hostname) || search.get('demo') === '1';
};

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
    throw new KitchenApiError(
      payload.message || 'Не удалось выполнить действие',
      response.status,
    );
  }
  return payload;
};

const joinUrl = (baseUrl, path) =>
  `${String(baseUrl).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;

export const createKitchenApi = ({
  baseUrl = '/api/kitchen',
  fetchImpl = globalThis.fetch,
  eventSourceFactory = (url) => new EventSource(url),
} = {}) => {
  const jsonRequest = (path, options) =>
    requestJson(fetchImpl, joinUrl(baseUrl, path), options);

  return {
    login(pin) {
      return jsonRequest('/session', {
        method: 'POST',
        body: JSON.stringify({ pin: String(pin || '') }),
      });
    },

    logout() {
      return jsonRequest('/session', { method: 'DELETE' });
    },

    getBoard() {
      return jsonRequest('/board', { method: 'GET' });
    },

    getHistory(filters = {}) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value && value !== 'all') search.set(key, value);
      }
      const suffix = search.size ? `?${search.toString()}` : '';
      return jsonRequest(`/history${suffix}`, { method: 'GET' });
    },

    changeStatus(orderId, status, operationId) {
      return jsonRequest(`/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'POST',
        headers: { 'Idempotency-Key': operationId },
        body: JSON.stringify({ status }),
      });
    },

    cancelOrder(orderId, payload, operationId) {
      return jsonRequest(`/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': operationId },
        body: JSON.stringify({
          reasonId: String(payload?.reasonId || ''),
          comment: String(payload?.comment || '').trim(),
        }),
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

export const createDemoKitchenApi = ({
  now = () => Date.now(),
  delay = () => wait(180),
} = {}) => {
  const employees = createDemoEmployees();
  let activeOrders = createDemoOrders(now());
  let historyOrders = [];
  let session = null;
  const operationResults = new Map();
  const listeners = new Set();
  const connectionListeners = new Set();

  const serverTime = () => new Date(now()).toISOString();
  const requireSession = () => {
    if (!session) throw new KitchenApiError('Войдите под личным PIN', 401);
  };
  const emit = (event) => {
    for (const listener of listeners) listener(clone(event));
  };
  const runOnce = (operationId, operation) => {
    if (!operationId) {
      return Promise.reject(new KitchenApiError('Нет ключа операции', 400));
    }
    if (operationResults.has(operationId)) {
      return operationResults.get(operationId).then(clone);
    }
    const pending = Promise.resolve().then(operation);
    operationResults.set(operationId, pending);
    return pending.then(clone);
  };

  return {
    async login(pin) {
      await delay();
      const employee = employees.find((item) => item.pin === String(pin || ''));
      if (!employee) throw new KitchenApiError('Неверный PIN', 401);
      session = { id: employee.id, name: employee.name, shift: employee.shift };
      return {
        employee: { id: session.id, name: session.name },
        shift: session.shift,
      };
    },

    async logout() {
      await delay();
      session = null;
      return {};
    },

    async getBoard() {
      requireSession();
      await delay();
      return { orders: clone(activeOrders), serverTime: serverTime() };
    },

    async getHistory(filters = {}) {
      requireSession();
      await delay();
      const query = String(filters.query || '').trim();
      const status = String(filters.status || 'all');
      const orders = historyOrders.filter(
        (order) =>
          (!query || order.number.includes(query)) &&
          (status === 'all' || order.status === status),
      );
      return { orders: clone(orders), serverTime: serverTime() };
    },

    changeStatus(orderId, nextStatus, operationId) {
      requireSession();
      return runOnce(operationId, async () => {
        await delay();
        const index = activeOrders.findIndex((order) => order.id === orderId);
        if (index < 0) throw new KitchenApiError('Заказ не найден', 404);
        const order = activeOrders[index];
        const action = getNextKitchenAction(order);
        if (!action || action.status !== nextStatus) {
          throw new KitchenApiError('Недопустимый переход статуса', 409);
        }

        const changedAt = serverTime();
        const updated = {
          ...order,
          status: nextStatus,
          employee: session.name,
          acceptedAt:
            nextStatus === 'accepted' ? changedAt : order.acceptedAt || '',
          history: [
            ...(order.history || []),
            createStatusHistoryEntry({
              from: order.status,
              to: nextStatus,
              employee: session.name,
              at: changedAt,
            }),
          ],
        };

        if (nextStatus === 'issued' || nextStatus === 'handed_to_courier') {
          activeOrders.splice(index, 1);
          historyOrders.unshift(updated);
        } else {
          activeOrders[index] = updated;
        }
        emit({ type: 'order.updated', order: updated });
        return { order: clone(updated), serverTime: changedAt };
      });
    },

    cancelOrder(orderId, payload, operationId) {
      requireSession();
      return runOnce(operationId, async () => {
        const reasonId = String(payload?.reasonId || '');
        const comment = String(payload?.comment || '').trim();
        const reason = CANCELLATION_REASONS.find((item) => item.id === reasonId);
        if (!reason) throw new KitchenApiError('Выберите причину отмены', 400);
        if (reasonId === 'other' && comment.length < 3) {
          throw new KitchenApiError('Опишите причину отмены', 400);
        }
        await delay();
        const index = activeOrders.findIndex((order) => order.id === orderId);
        if (index < 0) throw new KitchenApiError('Заказ не найден', 404);
        const order = activeOrders[index];
        const changedAt = serverTime();
        const updated = {
          ...order,
          status: 'cancelled',
          employee: session.name,
          refundStatus: 'processing',
          cancellation: { reasonId, reason: reason.label, comment },
          history: [
            ...(order.history || []),
            createStatusHistoryEntry({
              from: order.status,
              to: 'cancelled',
              employee: session.name,
              at: changedAt,
              reason: comment || reason.label,
            }),
          ],
        };
        activeOrders.splice(index, 1);
        historyOrders.unshift(updated);
        emit({ type: 'order.cancelled', order: updated });
        return {
          orderId,
          order: clone(updated),
          refundStatus: 'processing',
          serverTime: changedAt,
        };
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
