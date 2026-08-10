const safeInteger = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const calculateEta = ({
  shawarmaPortions = 0,
  otherMinutes = 0,
  cooks = 2,
  portionsPerCook = 3,
} = {}) => {
  const portions = safeInteger(shawarmaPortions);
  const extra = safeInteger(otherMinutes);
  const capacity = Math.max(1, safeInteger(cooks) * safeInteger(portionsPerCook));
  const batches = portions > 0 ? Math.ceil(portions / capacity) : 0;
  const min = batches * 6 + extra;
  const max = batches > 0 ? batches * 8 - (batches - 1) + extra : extra;

  return { min: Math.max(1, min), max: Math.max(2, max) };
};
