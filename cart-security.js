import { PRODUCTS } from './catalog-data.js?v=2026090101';
import { createCartLine } from './cart-state.js';
import { normalizeOptionQuantities } from './option-quantities.js';
import {
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  getProductConfiguration,
  getSizeLabelWithWeight,
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
  SIZE_LABELS,
  SIZE_WEIGHT_LABELS,
} from './product-config.js?v=2026090101';

export const MAX_CART_LINE_QUANTITY = 20;
export const MAX_CART_ITEM_COUNT = 50;

const PRODUCT_BY_ID = new Map(PRODUCTS.map((product) => [product.id, product]));

const createLabelLookup = (dictionary) =>
  new Map(
    Object.entries(dictionary).flatMap(([id, value]) => {
      const label = typeof value === 'string' ? value : value?.label;
      return [
        [id, id],
        ...(label ? [[String(label), id]] : []),
      ];
    }),
  );

const MEAT_ID_BY_VALUE = createLabelLookup(MEAT_LABELS);
const ADDON_ID_BY_VALUE = createLabelLookup(PRODUCT_ADDONS);
const SAUCE_ID_BY_VALUE = createLabelLookup(PRODUCT_SAUCES);

const resolveMeat = (productId, value) => {
  const allowed = getAvailableMeats(productId);
  const resolved = MEAT_ID_BY_VALUE.get(String(value ?? ''));
  return allowed.includes(resolved) ? resolved : allowed[0] || '';
};

const resolveSize = (productId, meat, value) => {
  const allowed = getAvailableSizes(productId, meat);
  const source = String(value ?? '').trim();
  const resolved = allowed.find((id) =>
    [
      id,
      SIZE_LABELS[id],
      SIZE_WEIGHT_LABELS[id],
      getSizeLabelWithWeight(id),
    ]
      .filter(Boolean)
      .includes(source),
  );
  return resolved || allowed[0] || '';
};

const resolveOptions = (value, allowedIds, idByValue) => {
  const allowed = new Set(allowedIds || []);
  return Object.fromEntries(
    Object.entries(normalizeOptionQuantities(value))
      .map(([rawId, quantity]) => [idByValue.get(rawId), quantity])
      .filter(([id]) => id && allowed.has(id)),
  );
};

const toDisplayOptions = (value, dictionary) =>
  Object.fromEntries(
    Object.entries(value).map(([id, quantity]) => [
      dictionary[id]?.label || id,
      quantity,
    ]),
  );

export const resolveCanonicalCartSelection = (line = {}) => {
  const productId = String(line?.productId || '');
  const configuration = getProductConfiguration(productId);
  if (!PRODUCT_BY_ID.has(productId) || !configuration) return null;

  const meat = resolveMeat(productId, line.meat);
  const size = resolveSize(productId, meat, line.size);
  if (!meat || !size) return null;

  return {
    productId,
    meat,
    size,
    addons: resolveOptions(
      line.addons,
      configuration.addons,
      ADDON_ID_BY_VALUE,
    ),
    sauces: resolveOptions(
      line.sauces || (line.sauce ? { [line.sauce]: 1 } : {}),
      configuration.sauces,
      SAUCE_ID_BY_VALUE,
    ),
  };
};

export const sanitizeCartLine = (line = {}, quantityLimit = MAX_CART_LINE_QUANTITY) => {
  const selection = resolveCanonicalCartSelection(line);
  if (!selection) return null;

  const product = PRODUCT_BY_ID.get(selection.productId);
  const quantity = Math.min(
    MAX_CART_LINE_QUANTITY,
    Math.max(0, Math.floor(Number(quantityLimit) || 0)),
    Math.max(1, Math.floor(Number(line.quantity) || 1)),
  );
  if (quantity < 1) return null;

  const unitPrice = calculateProductPrice(selection.productId, selection);
  if (!Number.isInteger(unitPrice) || unitPrice < 1) return null;

  return createCartLine({
    productId: product.id,
    name: product.name,
    unitPrice,
    meat: MEAT_LABELS[selection.meat] || '',
    size: getSizeLabelWithWeight(selection.size),
    addons: toDisplayOptions(selection.addons, PRODUCT_ADDONS),
    sauces: toDisplayOptions(selection.sauces, PRODUCT_SAUCES),
    comment: String(line.comment || '').trim().slice(0, 160),
    quantity,
    image: product.image || null,
    icon: product.icon || 'bag',
  });
};

export const sanitizeCartLines = (lines = []) => {
  const safeLines = [];
  let remaining = MAX_CART_ITEM_COUNT;

  for (const line of Array.isArray(lines) ? lines : []) {
    if (remaining < 1) break;
    const safeLine = sanitizeCartLine(line, remaining);
    if (!safeLine) continue;
    safeLines.push(safeLine);
    remaining -= safeLine.quantity;
  }

  return safeLines;
};

export const createCanonicalCheckoutItems = (lines = []) =>
  sanitizeCartLines(lines).flatMap((line) => {
    const selection = resolveCanonicalCartSelection(line);
    return selection
      ? [{
          productId: selection.productId,
          quantity: line.quantity,
          meat: selection.meat,
          size: selection.size,
          addons: selection.addons,
          sauces: selection.sauces,
        }]
      : [];
  });
