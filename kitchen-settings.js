const normalizeProductIds = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ].sort();

export const normalizeKitchenSettings = (value = {}) => ({
  acceptingOrders: value.acceptingOrders !== false,
  stoppedProductIds: normalizeProductIds(value.stoppedProductIds),
});

export const toggleStoppedProduct = (settings = {}, productId = '') => {
  const normalized = normalizeKitchenSettings(settings);
  const id = String(productId || '').trim();
  if (!id) return normalized;

  const stopped = new Set(normalized.stoppedProductIds);
  if (stopped.has(id)) stopped.delete(id);
  else stopped.add(id);

  return normalizeKitchenSettings({
    ...normalized,
    stoppedProductIds: [...stopped],
  });
};
