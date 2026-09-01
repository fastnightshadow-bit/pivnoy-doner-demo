import { PRODUCTS } from './catalog-data.js?v=2026090101';
import { createCartLine } from './cart-state.js';
import { normalizeOptionQuantities } from './option-quantities.js';
import {
  MEAT_LABELS,
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  getProductConfiguration,
  isProductAvailableForMeats,
} from './product-config.js?v=2026090101';

const toSet = (value) =>
  new Set((Array.isArray(value) ? value : []).map(String));

const hasSelectedStoppedOption = (value, stopped) =>
  Object.keys(normalizeOptionQuantities(value)).some((id) => stopped.has(id));

export const getKioskAvailability = (
  product,
  selection = {},
  settings = {},
) => {
  if (!product) return { available: false, reason: 'Блюдо не найдено' };
  if (settings.acceptingOrders === false) {
    return { available: false, reason: 'Приём заказов приостановлен' };
  }

  const stoppedProducts = toSet(settings.stoppedProductIds);
  const stoppedMeats = toSet(settings.stoppedMeatIds);
  const stoppedSauces = toSet(settings.stoppedSauceIds);
  const stoppedAddons = toSet(settings.stoppedAddonIds);

  if (
    stoppedProducts.has(String(product.id)) ||
    !isProductAvailableForMeats(product.id, stoppedMeats)
  ) {
    return { available: false, reason: 'Временно нет в наличии' };
  }
  if (
    selection.meat &&
    selection.meat !== 'default' &&
    stoppedMeats.has(String(selection.meat))
  ) {
    return {
      available: false,
      reason: `${MEAT_LABELS[selection.meat] || 'Выбранное мясо'} временно недоступна`,
    };
  }
  if (hasSelectedStoppedOption(selection.sauces, stoppedSauces)) {
    return { available: false, reason: 'Выбранный соус временно недоступен' };
  }
  if (hasSelectedStoppedOption(selection.addons, stoppedAddons)) {
    return { available: false, reason: 'Одна из добавок временно недоступна' };
  }
  return { available: true, reason: '' };
};

const keepAvailableOptions = (value, allowedIds, stoppedIds) => {
  const allowed = new Set(allowedIds);
  const stopped = toSet(stoppedIds);
  return Object.fromEntries(
    Object.entries(normalizeOptionQuantities(value)).filter(
      ([id]) => allowed.has(id) && !stopped.has(id),
    ),
  );
};

export const reconcileKioskCart = (
  lines,
  settings = {},
  products = PRODUCTS,
) => {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const normalized = [];
  const removedLineIds = [];
  let changed = false;

  for (const line of Array.isArray(lines) ? lines : []) {
    const product = productsById.get(String(line.productId));
    const availability = getKioskAvailability(
      product,
      { meat: line.meat },
      { ...settings, acceptingOrders: true },
    );
    if (!availability.available) {
      removedLineIds.push(String(line.lineId || ''));
      changed = true;
      continue;
    }

    const configuration = getProductConfiguration(product.id);
    const meat = line.meat || getAvailableMeats(product.id)[0] || 'default';
    const size = line.size || getAvailableSizes(product.id, meat)[0] || 'single';
    const addons = keepAvailableOptions(
      line.addons,
      configuration?.addons || [],
      settings.stoppedAddonIds,
    );
    const sauces = keepAvailableOptions(
      line.sauces,
      configuration?.sauces || [],
      settings.stoppedSauceIds,
    );
    const unitPrice = calculateProductPrice(product.id, {
      meat,
      size,
      addons,
      sauces,
    });
    const next = createCartLine({
      ...line,
      name: product.name,
      unitPrice,
      meat,
      size,
      addons,
      sauces,
      image: product.image,
      icon: product.icon,
    });

    if (
      next.lineId !== line.lineId ||
      next.unitPrice !== line.unitPrice ||
      JSON.stringify(next.addons) !== JSON.stringify(line.addons || {}) ||
      JSON.stringify(next.sauces) !== JSON.stringify(line.sauces || {})
    ) {
      changed = true;
    }
    normalized.push(next);
  }

  return { lines: normalized, removedLineIds, changed };
};
