import {
  CANCELLATION_REASONS,
  createStatusHistoryEntry,
  getNextKitchenAction,
} from './kitchen-model.js?v=2026081409';
import {
  createDemoEmployees,
  createDemoOrders,
} from './kitchen-fixtures.js?v=2026081409';
import { normalizeKitchenSettings } from './kitchen-settings.js?v=2026081409';
import { PRODUCTS } from './catalog-data.js';
import {
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
  SIZE_LABELS,
} from './product-config.js';
import { normalizeOptionQuantities } from './option-quantities.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class KitchenApiError extends Error {
  constructor(message, status = 0, code = '', details = null) {
    super(message);
    this.name = 'KitchenApiError';
    this.status = status;
    this.code = code;
    this.details = details;
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
      payload.error || '',
      payload.details || null,
    );
  }
  return payload;
};

const joinUrl = (baseUrl, path) =>
  `${String(baseUrl).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;

const createPromisedAt = (order) => {
  const createdAt = Date.parse(order.createdAt || order.created_at || '');
  const etaMax = Number(order.eta?.max ?? order.eta_max) || 12;
  return Number.isFinite(createdAt)
    ? new Date(createdAt + etaMax * 60000).toISOString()
    : '';
};

const toOptions = (item = {}) => {
  const configuration = item.configuration || {};
  const labels = [
    MEAT_LABELS[configuration.meat || item.meat],
    SIZE_LABELS[configuration.size || item.size],
  ].filter(Boolean);
  for (const [id, quantity] of Object.entries(
    normalizeOptionQuantities(configuration.addons || item.addons),
  )) {
    const label = PRODUCT_ADDONS[id]?.label || id;
    labels.push(quantity > 1 ? `${label} ×${quantity}` : label);
  }
  for (const [id, quantity] of Object.entries(
    normalizeOptionQuantities(configuration.sauces || item.sauces),
  )) {
    const label = PRODUCT_SAUCES[id]?.label || id;
    labels.push(quantity > 1 ? `${label} ×${quantity}` : label);
  }
  return labels;
};

export const normalizeProductionKitchenOrder = (order = {}) => {
  const status =
    order.status === 'submitted'
      ? 'new'
      : order.status === 'completed'
        ? 'issued'
        : order.status === 'courier'
          ? 'handed_to_courier'
          : order.status;
  return {
    id: order.id,
    number: String(order.number ?? order.public_number ?? ''),
    status,
    version: Number(order.version) || 1,
    paymentStatus:
      (order.paymentStatus ?? order.payment_status) === 'paid'
        ? 'succeeded'
        : order.paymentStatus ?? order.payment_status,
    fulfillment: order.fulfillment,
    createdAt: order.createdAt ?? order.created_at,
    promisedAt: order.promisedAt || createPromisedAt(order),
    customer: {
      name: order.customerName ?? order.customer_name ?? '',
      phone: order.phone || '',
    },
    address: order.address || null,
    items: (Array.isArray(order.items) ? order.items : []).map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      options: toOptions(item),
      comment: item.comment || '',
    })),
    comment: order.comment ?? order.customer_comment ?? '',
    total: Number(order.total) || 0,
    employee: order.employee || '',
    history: (Array.isArray(order.history) ? order.history : []).map((entry) => ({
      from: entry.from ?? entry.previous_status ?? '',
      to: entry.to ?? entry.new_status ?? '',
      employee: entry.employee ?? entry.actor_name ?? '',
      at: entry.at ?? entry.created_at ?? '',
      reason: entry.reason || '',
    })),
  };
};

export const createKitchenApi = ({
  baseUrl = '/api',
  fetchImpl = globalThis.fetch,
  eventSourceFactory = (url) => new EventSource(url),
} = {}) => {
  const jsonRequest = (path, options) =>
    requestJson(fetchImpl, joinUrl(baseUrl, path), options);

  const toSession = (session) => {
    if (!session?.authenticated || !session.account) return null;
    if (!['kitchen', 'owner'].includes(session.account.role)) return null;
    return {
      employee: {
        id: session.account.id,
        name: session.account.displayName || 'Кухня',
      },
      shift: '2 повара',
    };
  };

  return {
    async getSession() {
      return toSession(
        await jsonRequest('/auth/session', { method: 'GET' }),
      );
    },

    async login(pin) {
      await jsonRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ role: 'kitchen', pin: String(pin || '') }),
      });
      return this.getSession();
    },

    logout() {
      return jsonRequest('/auth/logout', { method: 'POST' });
    },

    async getBoard() {
      const response = await jsonRequest('/staff/orders', { method: 'GET' });
      return {
        orders: (response.orders || []).map(normalizeProductionKitchenOrder),
        serverTime: new Date().toISOString(),
      };
    },

    getSettings() {
      return jsonRequest('/settings', { method: 'GET' });
    },

    async updateSettings(settings) {
      const normalized = normalizeKitchenSettings(settings);
      await jsonRequest('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ acceptingOrders: normalized.acceptingOrders }),
      });
      const stopped = new Set(normalized.stoppedProductIds);
      await Promise.all(
        PRODUCTS.map((product) =>
          jsonRequest(`/catalog/${encodeURIComponent(product.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ available: !stopped.has(product.id) }),
          }),
        ),
      );
      return jsonRequest('/settings', { method: 'GET' });
    },

    getHistory(filters = {}) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value && value !== 'all') search.set(key, value);
      }
      const suffix = search.size ? `?${search.toString()}` : '';
      return jsonRequest(`/history${suffix}`, { method: 'GET' });
    },

    async changeStatus(orderId, status, version) {
      const serverStatus =
        status === 'issued'
          ? 'completed'
          : status === 'handed_to_courier'
            ? 'courier'
            : status;
      const order = await jsonRequest(
        `/staff/orders/${encodeURIComponent(orderId)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: serverStatus, version }),
        },
      );
      return { order: normalizeProductionKitchenOrder(order) };
    },

    async cancelOrder(orderId, payload, version) {
      const order = await jsonRequest(
        `/staff/orders/${encodeURIComponent(orderId)}/status`,
        {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'cancelled',
          version,
          reason: String(payload?.comment || payload?.reasonId || '').trim(),
        }),
      });
      return { order: normalizeProductionKitchenOrder(order) };
    },

    subscribe(onEvent, onConnection = () => {}) {
      const source = eventSourceFactory(joinUrl(baseUrl, '/events?scope=staff'));
      source.onopen = () => onConnection(true);
      source.onerror = () => onConnection(false);
      source.onmessage = (event) => {
        try {
          onEvent(JSON.parse(event.data));
        } catch {
          onConnection(false);
        }
      };
      [
        'order.created',
        'order.updated',
        'order.cancelled',
        'payment.updated',
        'settings.updated',
      ].forEach(
        (type) =>
          source.addEventListener?.(type, (event) => {
            try {
              const payload = JSON.parse(event.data);
              onEvent({ type: 'sync.required', sourceType: type, payload });
            } catch {
              onConnection(false);
            }
          }),
      );
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
  let settings = normalizeKitchenSettings();
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
    async getSession() {
      return session
        ? {
            employee: { id: session.id, name: session.name },
            shift: session.shift,
          }
        : null;
    },

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

    async getSettings() {
      requireSession();
      await delay();
      return clone(settings);
    },

    updateSettings(nextSettings, operationId) {
      requireSession();
      return runOnce(operationId, async () => {
        await delay();
        settings = normalizeKitchenSettings(nextSettings);
        emit({ type: 'settings.updated', settings });
        return clone(settings);
      });
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

    changeStatus(
      orderId,
      nextStatus,
      versionOrOperationId,
      operationId = versionOrOperationId,
    ) {
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

    cancelOrder(
      orderId,
      payload,
      versionOrOperationId,
      operationId = versionOrOperationId,
    ) {
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
