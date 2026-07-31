const toNonNegativeNumber = (value) => Math.max(0, Number(value) || 0);

const hashString = (value) => {
  let hash = 5381;
  for (const character of value) {
    hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  }
  return (hash >>> 0).toString(36);
};

const normalizeAddons = (addons) =>
  [...new Set(Array.isArray(addons) ? addons.filter(Boolean) : [])].sort();

export const getLineSignature = ({
  productId = '',
  meat = '',
  size = '',
  addons = [],
  comment = '',
}) => {
  const configuration = [
    productId,
    meat,
    size,
    normalizeAddons(addons).join(','),
    String(comment).trim(),
  ].join('|');
  return `${productId || 'item'}-${hashString(configuration)}`;
};

export const createCartLine = ({
  productId,
  name,
  unitPrice,
  meat = '',
  size = '',
  addons = [],
  comment = '',
  quantity = 1,
  image = null,
  icon = 'bag',
}) => {
  const normalized = {
    productId: String(productId || ''),
    name: String(name || ''),
    unitPrice: toNonNegativeNumber(unitPrice),
    meat: String(meat || ''),
    size: String(size || ''),
    addons: normalizeAddons(addons),
    comment: String(comment || '').trim(),
    quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
    image: image || null,
    icon: String(icon || 'bag'),
  };

  return {
    ...normalized,
    lineId: getLineSignature(normalized),
  };
};

export const addCartLine = (lines, incoming) => {
  const normalized = createCartLine(incoming);
  const current = Array.isArray(lines) ? lines : [];
  const existingIndex = current.findIndex(
    ({ lineId }) => lineId === normalized.lineId,
  );

  if (existingIndex < 0) return [...current, normalized];

  return current.map((line, index) =>
    index === existingIndex
      ? { ...line, quantity: line.quantity + normalized.quantity }
      : line,
  );
};

export const changeCartLineQuantity = (lines, lineId, delta) =>
  (Array.isArray(lines) ? lines : []).flatMap((line) => {
    if (line.lineId !== lineId) return [line];
    const quantity = Math.max(
      0,
      Math.floor(Number(line.quantity) || 0) + Math.floor(Number(delta) || 0),
    );
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });

export const removeCartLine = (lines, lineId) =>
  (Array.isArray(lines) ? lines : []).filter((line) => line.lineId !== lineId);

export const getCartItemCount = (lines) =>
  (Array.isArray(lines) ? lines : []).reduce(
    (total, line) => total + Math.max(0, Math.floor(Number(line.quantity) || 0)),
    0,
  );

export const calculateCartSummary = (lines, delivery = 0, discount = 0) => {
  const items = (Array.isArray(lines) ? lines : []).reduce(
    (total, line) =>
      total +
      toNonNegativeNumber(line.unitPrice) *
        Math.max(0, Math.floor(Number(line.quantity) || 0)),
    0,
  );
  const safeDelivery = toNonNegativeNumber(delivery);
  const safeDiscount = Math.min(
    toNonNegativeNumber(discount),
    items + safeDelivery,
  );

  return {
    items,
    delivery: safeDelivery,
    discount: safeDiscount,
    total: items + safeDelivery - safeDiscount,
  };
};
