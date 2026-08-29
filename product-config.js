import { PRODUCTS } from './catalog-data.js';

export const MEAT_LABELS = Object.freeze({
  chicken: 'Курица',
  beef: 'Говядина',
  default: '',
});

export const SIZE_LABELS = Object.freeze({
  standard: 'Стандарт',
  giant: 'Гигант',
  single: '',
});

export const SIZE_WEIGHT_LABELS = Object.freeze({
  standard: '350 г',
  giant: '650 г',
  single: '',
});

export const getSizeLabelWithWeight = (size) =>
  [SIZE_LABELS[size], SIZE_WEIGHT_LABELS[size]].filter(Boolean).join(' · ');

export const PRODUCT_ADDONS = Object.freeze({
  jalapeno: Object.freeze({ label: 'Халапеньо', price: 50 }),
  onion: Object.freeze({ label: 'Жареный лук', price: 50 }),
  fries: Object.freeze({ label: 'Картофель фри', price: 50 }),
  cheese: Object.freeze({ label: 'Сыр', price: 100 }),
  meat: Object.freeze({ label: 'Дополнительное мясо', price: 100 }),
});

export const PRODUCT_SAUCES = Object.freeze({
  tasty: Object.freeze({ label: 'Тейсти', price: 50 }),
  burger: Object.freeze({ label: 'Бургерный', price: 50 }),
  cheese: Object.freeze({ label: 'Сырный', price: 50 }),
  bbq: Object.freeze({ label: 'Барбекю', price: 50 }),
  truffle: Object.freeze({ label: 'Трюфель', price: 50 }),
  ketchup: Object.freeze({ label: 'Кетчуп', price: 50 }),
  curry: Object.freeze({ label: 'Карри', price: 50 }),
  blueCheese: Object.freeze({ label: 'Блю чиз', price: 50 }),
  mustard: Object.freeze({ label: 'Горчица', price: 50 }),
  chili: Object.freeze({ label: 'Чили', price: 50 }),
});

const ALL_SAUCES = Object.freeze(Object.keys(PRODUCT_SAUCES));

const shawarma = (
  chickenStandard,
  chickenGiant,
  beefStandard,
  beefGiant,
) =>
  Object.freeze({
    prices: Object.freeze({
      chicken: Object.freeze({
        standard: chickenStandard,
        giant: chickenGiant,
      }),
      beef: Object.freeze({
        standard: beefStandard,
        giant: beefGiant,
      }),
    }),
    addons: Object.freeze(Object.keys(PRODUCT_ADDONS)),
    sauces: ALL_SAUCES,
    defaultSauce: '',
  });

const PRODUCT_CONFIGURATIONS = Object.freeze({
  'classic-shawarma': shawarma(300, 530, 400, 700),
  'tasty-shawarma': shawarma(350, 630, 450, 800),
  'curry-shawarma': shawarma(350, 630, 450, 800),
  'burger-shawarma': shawarma(350, 630, 450, 800),
  'bbq-shawarma': shawarma(350, 630, 450, 800),
  'truffle-shawarma': shawarma(380, 680, 480, 830),
  'four-cheese-shawarma': shawarma(430, 700, 500, 850),
  doner: Object.freeze({
    prices: Object.freeze({
      chicken: Object.freeze({ single: 350 }),
      beef: Object.freeze({ single: 450 }),
    }),
    addons: Object.freeze([]),
    sauces: ALL_SAUCES,
    defaultSauce: '',
  }),
  'doner-box': Object.freeze({
    prices: Object.freeze({
      chicken: Object.freeze({ single: 550 }),
      beef: Object.freeze({ single: 750 }),
    }),
    addons: Object.freeze([]),
    sauces: ALL_SAUCES,
    defaultSauce: '',
  }),
});

export const getProductConfiguration = (productId) => {
  if (PRODUCT_CONFIGURATIONS[productId]) {
    return PRODUCT_CONFIGURATIONS[productId];
  }

  const product = PRODUCTS.find(({ id }) => id === productId);
  if (!product) return null;

  return {
    prices: {
      default: {
        single: product.price,
      },
    },
    addons: [],
    sauces: ALL_SAUCES,
    defaultSauce: '',
  };
};

export const getAvailableMeats = (productId) =>
  Object.keys(getProductConfiguration(productId)?.prices ?? {});

export const getAvailableSizes = (productId, meat) =>
  Object.keys(getProductConfiguration(productId)?.prices?.[meat] ?? {});

export const calculateProductPrice = (
  productId,
  { meat = 'default', size = 'single', addons = [], sauce = '' } = {},
) => {
  const configuration = getProductConfiguration(productId);
  const basePrice = configuration?.prices?.[meat]?.[size];
  if (!Number.isFinite(basePrice)) return 0;

  const allowedAddons = new Set(configuration.addons);
  const addonsPrice = addons.reduce(
    (total, addon) =>
      total +
      (allowedAddons.has(addon) ? PRODUCT_ADDONS[addon]?.price ?? 0 : 0),
    0,
  );
  const saucePrice = configuration.sauces.includes(sauce)
    ? PRODUCT_SAUCES[sauce]?.price ?? 0
    : 0;

  return basePrice + addonsPrice + saucePrice;
};

export const getProductDescription = (product, meat = 'default') => {
  if (!product) return '';
  const meatLabel = MEAT_LABELS[meat];
  if (!meatLabel) return product.description;

  return product.description.replace(
    /^(Курица или говядина|Мясо)/,
    meatLabel,
  );
};
