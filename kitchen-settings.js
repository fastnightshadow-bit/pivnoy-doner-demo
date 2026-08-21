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
  stoppedMeatIds: normalizeProductIds(value.stoppedMeatIds),
  stoppedSauceIds: normalizeProductIds(value.stoppedSauceIds),
  stoppedAddonIds: normalizeProductIds(value.stoppedAddonIds),
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

export const toggleStoppedOption = (
  settings = {},
  kind = '',
  optionId = '',
) => {
  const normalized = normalizeKitchenSettings(settings);
  const key =
    kind === 'meat'
      ? 'stoppedMeatIds'
      : kind === 'sauce'
        ? 'stoppedSauceIds'
        : kind === 'addon'
          ? 'stoppedAddonIds'
          : '';
  const id = String(optionId || '').trim();
  if (!key || !id) return normalized;

  const stopped = new Set(normalized[key]);
  if (stopped.has(id)) stopped.delete(id);
  else stopped.add(id);

  return normalizeKitchenSettings({
    ...normalized,
    [key]: [...stopped],
  });
};
