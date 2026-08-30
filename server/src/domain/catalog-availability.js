import {
  getAvailableMeats,
  getProductMeatIds,
  normalizeOptionQuantities,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
} from '../../../shared/catalog.js';
import { DomainError } from './errors.js';

const knownSauces = new Set(Object.keys(PRODUCT_SAUCES));
const knownAddons = new Set(Object.keys(PRODUCT_ADDONS));

const stringSet = (values) => new Set(
  Array.isArray(values) ? values.map(String) : [],
);

export const assertCatalogAvailability = (items, catalog = {}) => {
  if (catalog?.acceptingOrders === false) {
    throw new DomainError('ORDERING_PAUSED');
  }

  const stoppedProducts = stringSet(catalog.stoppedProductIds);
  const productIds = [...new Set(
    items
      .map(({ productId }) => String(productId))
      .filter((productId) => stoppedProducts.has(productId)),
  )];
  if (productIds.length > 0) {
    throw new DomainError('PRODUCT_UNAVAILABLE', { productIds });
  }

  const stoppedMeats = stringSet(catalog.stoppedMeatIds);
  const stoppedSauces = stringSet(catalog.stoppedSauceIds);
  const stoppedAddons = stringSet(catalog.stoppedAddonIds);
  const selectedMeats = new Set();
  const selectedSauces = new Set();
  const selectedAddons = new Set();

  for (const item of items) {
    const productId = String(item.productId);
    const availableMeats = getAvailableMeats(productId);
    const meat = availableMeats.includes(item.meat)
      ? item.meat
      : availableMeats[0];
    if (meat && stoppedMeats.has(meat)) selectedMeats.add(meat);
    if (availableMeats.every((meatId) => meatId === 'default')) {
      for (const productMeatId of getProductMeatIds(productId)) {
        if (stoppedMeats.has(productMeatId)) selectedMeats.add(productMeatId);
      }
    }
    for (const [sauceId, quantity] of Object.entries(
      normalizeOptionQuantities(item.sauces),
    )) {
      if (
        quantity > 0 &&
        knownSauces.has(sauceId) &&
        stoppedSauces.has(sauceId)
      ) selectedSauces.add(sauceId);
    }
    for (const [addonId, quantity] of Object.entries(
      normalizeOptionQuantities(item.addons),
    )) {
      if (
        quantity > 0 &&
        knownAddons.has(addonId) &&
        stoppedAddons.has(addonId)
      ) selectedAddons.add(addonId);
    }
  }

  if (
    selectedMeats.size > 0 ||
    selectedSauces.size > 0 ||
    selectedAddons.size > 0
  ) {
    throw new DomainError('PRODUCT_OPTION_UNAVAILABLE', {
      meatIds: [...selectedMeats].sort(),
      sauceIds: [...selectedSauces].sort(),
      addonIds: [...selectedAddons].sort(),
    });
  }
};
