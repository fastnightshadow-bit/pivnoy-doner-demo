const DEFAULT_COOKS = 2;
const DEFAULT_UNITS_PER_COOK = 3;
const DEFAULT_BATCH_MINUTES = 8;

const toQuantity = (value) =>
  Math.max(0, Math.floor(Number(value) || 0));

const isShawarmaItem = (item = {}) =>
  /shawarma|шаурм|шаверм|шава/i.test(
    `${String(item.productId || '')} ${String(item.id || '')} ${String(item.name || '')}`,
  );

export const countShawarmaUnits = (items = []) =>
  (Array.isArray(items) ? items : []).reduce(
    (total, item) =>
      total + (isShawarmaItem(item) ? Math.max(1, toQuantity(item.quantity)) : 0),
    0,
  );

export const calculatePreparationMinutes = ({
  queuedUnits = 0,
  incomingUnits = 0,
  cooks = DEFAULT_COOKS,
  unitsPerCook = DEFAULT_UNITS_PER_COOK,
  batchMinutes = DEFAULT_BATCH_MINUTES,
} = {}) => {
  const batchCapacity = Math.max(
    1,
    toQuantity(cooks) * toQuantity(unitsPerCook),
  );
  const totalUnits = Math.max(
    1,
    toQuantity(queuedUnits) + toQuantity(incomingUnits),
  );
  return Math.ceil(totalUnits / batchCapacity) * Math.max(1, toQuantity(batchMinutes));
};

export const createPreparationEta = (items = [], queuedItems = []) => {
  const min = calculatePreparationMinutes({
    queuedUnits: countShawarmaUnits(queuedItems),
    incomingUnits: countShawarmaUnits(items),
  });
  return { min, max: min + 4 };
};
