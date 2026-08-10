import { DomainError } from './errors.js';

export const DEFAULT_ORDER_SETTINGS = Object.freeze({
  deliveryPrice: 200,
  freeDeliveryFrom: 2000,
  minimumOrder: 300,
});

export const calculateDelivery = (
  itemsTotal,
  fulfillment,
  settings = DEFAULT_ORDER_SETTINGS,
) => {
  if (fulfillment !== 'delivery') return 0;
  if (itemsTotal < settings.minimumOrder) {
    throw new DomainError('MINIMUM_ORDER', {
      minimum: settings.minimumOrder,
      remaining: settings.minimumOrder - itemsTotal,
    });
  }
  return itemsTotal >= settings.freeDeliveryFrom ? 0 : settings.deliveryPrice;
};
