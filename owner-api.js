export class OwnerApiError extends Error {
  constructor(message, status = 0, code = 'API_ERROR') {
    super(message);
    this.name = 'OwnerApiError';
    this.status = status;
    this.code = code;
  }
}

const requestJson = async (fetchImpl, url, options = {}) => {
  const response = await fetchImpl(url, {
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new OwnerApiError(
      payload.message || 'Не удалось выполнить действие',
      response.status,
      payload.error,
    );
  }
  return payload;
};

export const createOwnerApi = ({ fetchImpl = globalThis.fetch } = {}) => ({
  login: async (pin) => {
    await requestJson(fetchImpl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role: 'owner', pin: String(pin || '') }),
    });
    const session = await requestJson(fetchImpl, '/api/auth/session');
    return session.account;
  },
  logout: () =>
    requestJson(fetchImpl, '/api/auth/logout', { method: 'POST' }),
  getDashboard: () => requestJson(fetchImpl, '/api/owner/dashboard'),
  setAcceptingOrders: (acceptingOrders) =>
    requestJson(fetchImpl, '/api/owner/settings', {
      method: 'PATCH',
      body: JSON.stringify({ acceptingOrders: Boolean(acceptingOrders) }),
    }),
  setAvailability: (productId, available) =>
    requestJson(
      fetchImpl,
      `/api/owner/catalog/${encodeURIComponent(String(productId || ''))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ available: Boolean(available) }),
      },
    ),
  setCategoryAvailability: (categoryId, available) =>
    requestJson(
      fetchImpl,
      `/api/owner/categories/${encodeURIComponent(String(categoryId || ''))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ available: Boolean(available) }),
      },
    ),
  setOptionAvailability: (kind, optionId, available) =>
    requestJson(
      fetchImpl,
      `/api/catalog-options/${encodeURIComponent(String(kind || ''))}/${encodeURIComponent(String(optionId || ''))}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ available: Boolean(available) }),
      },
    ),
  createKioskActivation: () =>
    requestJson(fetchImpl, '/api/owner/kiosk-activation', {
      method: 'POST',
    }),
});

export const createDemoOwnerApi = () => {
  let authenticated = false;
  let settings = {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  };
  const requireSession = () => {
    if (!authenticated) throw new OwnerApiError('Введите PIN', 401);
  };
  return {
    async login(pin) {
      if (String(pin || '') !== '0000') {
        throw new OwnerApiError('Неверный PIN', 401);
      }
      authenticated = true;
      return { displayName: 'Павел', role: 'owner' };
    },
    async logout() {
      authenticated = false;
      return {};
    },
    async getDashboard() {
      requireSession();
      return {
        activeOrders: 4,
        overdueOrders: 1,
        revenueToday: 4850,
        settings,
      };
    },
    async setAcceptingOrders(value) {
      requireSession();
      settings = { ...settings, acceptingOrders: Boolean(value) };
      return settings;
    },
    async setAvailability(productId, available) {
      requireSession();
      const stopped = new Set(settings.stoppedProductIds);
      if (available) stopped.delete(productId);
      else stopped.add(productId);
      settings = { ...settings, stoppedProductIds: [...stopped] };
      return { productId, available: Boolean(available) };
    },
    async setCategoryAvailability(categoryId, available) {
      requireSession();
      const { PRODUCTS } = await import('./catalog-data.js');
      const productIds = PRODUCTS
        .filter(({ category }) => category === categoryId)
        .map(({ id }) => id);
      const stopped = new Set(settings.stoppedProductIds);
      productIds.forEach((productId) => {
        if (available) stopped.delete(productId);
        else stopped.add(productId);
      });
      settings = { ...settings, stoppedProductIds: [...stopped] };
      return { categoryId, available: Boolean(available), productIds };
    },
    async setOptionAvailability(kind, optionId, available) {
      requireSession();
      const settingKey = {
        meat: 'stoppedMeatIds',
        sauce: 'stoppedSauceIds',
        addon: 'stoppedAddonIds',
      }[kind];
      if (!settingKey) throw new OwnerApiError('Неизвестная настройка', 404);
      const stopped = new Set(settings[settingKey] || []);
      if (available) stopped.delete(optionId);
      else stopped.add(optionId);
      settings = { ...settings, [settingKey]: [...stopped] };
      return { kind, optionId, available: Boolean(available) };
    },
    async createKioskActivation() {
      requireSession();
      return {
        code: '123456',
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
    },
  };
};
