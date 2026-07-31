export const PREFERRED_PRODUCT_LINES_KEY =
  'pivnoy-doner-preferred-product-lines-v1';

const getBrowserStorage = () =>
  typeof window !== 'undefined' ? window.localStorage : null;

export const loadPreferredProductLines = (
  storage = getBrowserStorage(),
) => {
  if (!storage?.getItem) return {};

  try {
    const parsed = JSON.parse(
      storage.getItem(PREFERRED_PRODUCT_LINES_KEY) || '{}',
    );
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

export const savePreferredProductLine = (
  storage = getBrowserStorage(),
  productId,
  lineId,
) => {
  const next = {
    ...loadPreferredProductLines(storage),
    [String(productId)]: String(lineId),
  };

  try {
    storage?.setItem?.(PREFERRED_PRODUCT_LINES_KEY, JSON.stringify(next));
  } catch {
    return next;
  }

  return next;
};

export const resolvePreferredProductLine = (
  lines,
  productId,
  preferences,
) => {
  const matches = (Array.isArray(lines) ? lines : []).filter(
    (line) => line.productId === productId,
  );
  if (!matches.length) return null;

  const hasPreference = Object.prototype.hasOwnProperty.call(
    preferences ?? {},
    productId,
  );
  if (!hasPreference) return matches.at(-1) ?? null;

  return (
    matches.find((line) => line.lineId === preferences[productId]) ?? null
  );
};
