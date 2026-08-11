export class ClientApiError extends Error {
  constructor(code, status, details = null) {
    super(code || 'API_ERROR');
    this.name = 'ClientApiError';
    this.code = code || 'API_ERROR';
    this.status = Number(status) || 0;
    this.details = details;
  }
}

const parseResponse = async (response) => {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new ClientApiError(
      body?.error || 'API_ERROR',
      response.status,
      body?.details ?? null,
    );
  }
  return body;
};

const requestOptions = (options = {}) => ({
  credentials: 'same-origin',
  ...options,
  headers: {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  },
});

const authorizationHeader = (token) => ({
  Authorization: `Bearer ${String(token || '')}`,
});

const TERMINAL_ORDER_STATUSES = new Set(['completed', 'cancelled']);
const PERMANENT_POLL_ERROR_STATUSES = new Set([401, 403, 404]);

export const normalizeClientOrderResponse = (value = {}) => ({
  ...value,
  status:
    value.paymentStatus === 'failed' ? 'payment-failed' : value.status,
  payment: value.paymentMethod === 'sbp' ? 'sbp' : 'card',
  restaurantPhone: value.restaurantPhone || '+7 925 647-45-77',
  delivery: Number(value.delivery ?? value.deliveryTotal) || 0,
  discount: Number(value.discount ?? value.discountTotal) || 0,
  itemsTotal: Number(value.itemsTotal) || 0,
  total: Number(value.total) || 0,
  items: (Array.isArray(value.items) ? value.items : []).map((item) => ({
    ...item,
    ...(item.configuration || {}),
  })),
});

export const createClientApi = (options = {}) => {
  const normalized =
    typeof options === 'function' ? { fetcher: options } : options;
  const fetcher = normalized.fetcher ?? globalThis.fetch?.bind(globalThis);
  const documentRef = normalized.documentRef ?? globalThis.document;
  const setTimeoutFn = normalized.setTimeoutFn ?? globalThis.setTimeout;
  const clearTimeoutFn = normalized.clearTimeoutFn ?? globalThis.clearTimeout;

  if (typeof fetcher !== 'function') {
    throw new Error('fetch-unavailable');
  }

  const fetchJson = async (url, options = {}) =>
    parseResponse(await fetcher(url, requestOptions(options)));
  const getOrder = async (id, accessToken) =>
    normalizeClientOrderResponse(
      await fetchJson(`/api/orders/${encodeURIComponent(String(id || ''))}`, {
        headers: authorizationHeader(accessToken),
      }),
    );

  return {
    createOrder: (payload, idempotencyKey) =>
      fetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': String(idempotencyKey || '') },
        body: JSON.stringify(payload),
      }),

    createPayment: (orderId, idempotencyKey, accessToken) =>
      fetchJson('/api/payments', {
        method: 'POST',
        headers: {
          'Idempotency-Key': String(idempotencyKey || ''),
          ...authorizationHeader(accessToken),
        },
        body: JSON.stringify({ orderId: String(orderId || '') }),
      }),

    getOrder,

    listReviews: () => fetchJson('/api/reviews'),

    findReviewByOrderId: async (orderId, accessToken) => {
      try {
        return await fetchJson(
          `/api/orders/${encodeURIComponent(String(orderId || ''))}/review`,
          { headers: authorizationHeader(accessToken) },
        );
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },

    submitReview: (orderId, data, accessToken) =>
      fetchJson(
        `/api/orders/${encodeURIComponent(String(orderId || ''))}/review`,
        {
          method: 'POST',
          headers: authorizationHeader(accessToken),
          body: JSON.stringify(data),
        },
      ),

    subscribeToOrder: (id, accessToken, handlers = {}) => {
      let stopped = false;
      let inFlight = false;
      let timerId = null;
      let onVisibilityChange = null;

      const isVisible = () => documentRef?.visibilityState !== 'hidden';
      const clearTimer = () => {
        if (timerId === null) return;
        clearTimeoutFn?.(timerId);
        timerId = null;
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimer();
        if (onVisibilityChange) {
          documentRef?.removeEventListener?.(
            'visibilitychange',
            onVisibilityChange,
          );
        }
      };
      const schedule = () => {
        if (
          stopped ||
          !isVisible() ||
          typeof setTimeoutFn !== 'function'
        ) {
          return;
        }
        clearTimer();
        timerId = setTimeoutFn(() => {
          timerId = null;
          return poll();
        }, 3000);
      };
      const poll = async () => {
        if (stopped || inFlight || !isVisible()) return;
        inFlight = true;
        try {
          const order = await getOrder(id, accessToken);
          if (stopped) return;
          handlers.onUpdate?.(order);
          if (TERMINAL_ORDER_STATUSES.has(order.status)) stop();
        } catch (error) {
          if (stopped) return;
          handlers.onError?.(error);
          if (PERMANENT_POLL_ERROR_STATUSES.has(Number(error?.status))) {
            stop();
          }
        } finally {
          inFlight = false;
          if (!stopped) schedule();
        }
      };
      onVisibilityChange = () => {
        clearTimer();
        if (isVisible()) void poll();
      };

      documentRef?.addEventListener?.('visibilitychange', onVisibilityChange);
      if (isVisible()) void poll();

      return stop;
    },
  };
};

export const clientApi =
  typeof globalThis.fetch === 'function' ? createClientApi() : null;
