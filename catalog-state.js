export const getProductsByCategory = (products, category) =>
  products.filter((product) => product.category === category);

export const applyCatalogFilters = (
  products,
  {
    priceRange = 'all',
    featuredOnly = false,
    newOnly = false,
    spicyOnly = false,
  } = {},
) =>
  products.filter((product) => {
    const priceMatches =
      priceRange === 'all' ||
      (priceRange === 'up-to-300' && product.price <= 300) ||
      (priceRange === '301-to-500' && product.price >= 301 && product.price <= 500) ||
      (priceRange === 'from-501' && product.price >= 501);

    return (
      priceMatches &&
      (!featuredOnly || product.badge === 'Хит') &&
      (!newOnly || product.badge === 'Новинка') &&
      (!spicyOnly || product.badge === 'Острое')
    );
  });

export const getVisibleBatch = (products, visibleCount) =>
  products.slice(0, Math.max(0, Number(visibleCount) || 0));

export const changeCatalogQuantity = (quantities, productId, delta) => ({
  ...quantities,
  [productId]: Math.max(
    0,
    (Number(quantities[productId]) || 0) + (Number(delta) || 0),
  ),
});

export const getCatalogCartCount = (quantities) =>
  Object.values(quantities).reduce(
    (total, value) => total + (Number(value) || 0),
    0,
  );

export const getProductNoun = (count) => {
  const value = Math.abs(Number(count) || 0);
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'товаров';
  if (lastDigit === 1) return 'товар';
  if (lastDigit >= 2 && lastDigit <= 4) return 'товара';
  return 'товаров';
};
