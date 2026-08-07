const clampQuantity = (value, max) =>
  Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));

export const normalizeOptionQuantities = (value, max = 5) => {
  const safeMax = Math.max(1, Math.floor(Number(max) || 5));
  const entries = Array.isArray(value)
    ? [...new Set(value.filter(Boolean))].map((id) => [id, 1])
    : Object.entries(value && typeof value === 'object' ? value : {});

  return Object.fromEntries(
    entries
      .map(([id, quantity]) => [String(id), clampQuantity(quantity, safeMax)])
      .filter(([id, quantity]) => id && quantity > 0)
      .sort(([left], [right]) => left.localeCompare(right, 'ru')),
  );
};

export const formatOptionQuantities = (value) =>
  Object.entries(normalizeOptionQuantities(value)).map(
    ([label, quantity]) => (quantity > 1 ? `${label} ×${quantity}` : label),
  );

export const serializeOptionQuantities = (value) =>
  Object.entries(normalizeOptionQuantities(value))
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join(',');
