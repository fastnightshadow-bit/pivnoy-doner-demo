import { PRODUCTS } from './catalog-data.js?v=2026090101';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const createKioskSettingsFixture = (overrides = {}) => ({
  acceptingOrders: true,
  stoppedProductIds: [],
  stoppedMeatIds: [],
  stoppedSauceIds: [],
  stoppedAddonIds: [],
  ...clone(overrides),
});

export const createKioskBootstrapFixture = ({ serverTime, settings } = {}) => ({
  products: clone(PRODUCTS),
  settings: createKioskSettingsFixture(settings),
  serverTime: serverTime || new Date().toISOString(),
});
