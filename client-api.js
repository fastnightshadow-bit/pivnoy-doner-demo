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

const createEventHandler = (handler) => (event) => {
  if (typeof handler !== 'function') return;
  try {
    handler(JSON.parse(event.data));
  } catch {
    // Ignore malformed realtime data and wait for the next valid event.
  }
};

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
  const EventSourceClass = normalized.EventSourceClass ?? globalThis.EventSource;

  if (typeof fetcher !== 'function') {
    throw new Error('fetch-unavailable');
  }

  const fetchJson = async (url, options = {}) =>
    parseResponse(await fetcher(url, requestOptions(options)));

  return {
    createOrder: (payload, idempotencyKey) =>
      fetchJson('/api/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': String(idempotencyKey || '') },
        body: JSON.stringify(payload),
      }),

    createPayment: (orderId, idempotencyKey) =>
      fetchJson('/api/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': String(idempotencyKey || '') },
        body: JSON.stringify({ orderId: String(orderId || '') }),
      }),

    getOrder: async (id) =>
      normalizeClientOrderResponse(
        await fetchJson(`/api/orders/${encodeURIComponent(String(id || ''))}`),
      ),

    listReviews: () => fetchJson('/api/reviews'),

    findReviewByOrderId: async (orderId) => {
      try {
        return await fetchJson(
          `/api/orders/${encodeURIComponent(String(orderId || ''))}/review`,
        );
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },

    submitReview: (orderId, data) =>
      fetchJson(
        `/api/orders/${encodeURIComponent(String(orderId || ''))}/review`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      ),

    subscribeToOrder: (id, handlers = {}) => {
      if (typeof EventSourceClass !== 'function') return () => {};
      const source = new EventSourceClass(
        `/api/events?orderId=${encodeURIComponent(String(id || ''))}`,
      );
      const onUpdate = createEventHandler(handlers.onUpdate);
      const onPayment = createEventHandler(
        handlers.onPayment ?? handlers.onUpdate,
      );

      source.onmessage = onUpdate;
      source.addEventListener?.('order.updated', onUpdate);
      source.addEventListener?.('payment.updated', onPayment);
      source.onerror = (event) => handlers.onError?.(event);
      return () => source.close();
    },
  };
};

export const clientApi =
  typeof globalThis.fetch === 'function' ? createClientApi() : null;
