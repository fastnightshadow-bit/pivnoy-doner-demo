export const KIOSK_SCREENS = Object.freeze([
  'start',
  'fulfillment',
  'catalog',
  'product',
  'cart',
  'payment-method',
  'card-payment',
  'qr-payment',
  'success',
  'error',
]);

export const createKioskState = () => ({
  screen: 'start',
  fulfillment: '',
  lines: [],
  selectedProductId: '',
  productReturnScreen: 'catalog',
  order: null,
  payment: null,
  error: '',
});

export const resetKioskState = createKioskState;

const BACK_SCREENS = Object.freeze({
  fulfillment: 'start',
  catalog: 'fulfillment',
  cart: 'catalog',
  'payment-method': 'cart',
  'card-payment': 'payment-method',
  'qr-payment': 'payment-method',
  error: 'payment-method',
});

const withScreen = (state, screen, updates = {}) => ({
  ...state,
  ...updates,
  screen,
  error: updates.error ?? '',
});

const getProductReturnScreen = (state) =>
  state.productReturnScreen === 'cart' ? 'cart' : 'catalog';

export const reduceKioskState = (state, event = {}) => {
  if (!state || !KIOSK_SCREENS.includes(state.screen)) return createKioskState();

  switch (event.type) {
    case 'START':
      return state.screen === 'start' ? withScreen(state, 'fulfillment') : state;

    case 'SET_FULFILLMENT':
      return state.screen === 'fulfillment' &&
        ['dine-in', 'takeaway'].includes(event.value)
        ? withScreen(state, 'catalog', { fulfillment: event.value })
        : state;

    case 'OPEN_PRODUCT':
      return ['catalog', 'cart'].includes(state.screen) && String(event.productId || '')
        ? withScreen(state, 'product', {
            selectedProductId: String(event.productId),
            productReturnScreen: state.screen === 'cart' ? 'cart' : 'catalog',
          })
        : state;

    case 'CLOSE_PRODUCT':
      return state.screen === 'product'
        ? withScreen(state, getProductReturnScreen(state), {
            selectedProductId: '',
            productReturnScreen: 'catalog',
          })
        : state;

    case 'SET_LINES':
      return Array.isArray(event.lines) ? { ...state, lines: [...event.lines] } : state;

    case 'OPEN_CART':
      return ['catalog', 'product'].includes(state.screen)
        ? withScreen(state, 'cart', {
            selectedProductId: '',
            productReturnScreen: 'catalog',
          })
        : state;

    case 'OPEN_PAYMENT_METHOD':
      return state.screen === 'cart' ? withScreen(state, 'payment-method') : state;

    case 'SELECT_PAYMENT':
      if (state.screen !== 'payment-method') return state;
      if (event.value === 'card') return withScreen(state, 'card-payment');
      if (event.value === 'qr') return withScreen(state, 'qr-payment');
      return state;

    case 'PAYMENT_SUCCEEDED':
      return state.screen === 'qr-payment'
        ? withScreen(state, 'success', { payment: event.payment || null })
        : state;

    case 'PAYMENT_FAILED':
      return ['card-payment', 'qr-payment'].includes(state.screen)
        ? withScreen(state, 'error', {
            payment: event.payment || state.payment,
            error: String(event.error || 'Не удалось выполнить оплату'),
          })
        : state;

    case 'BACK': {
      const screen = state.screen === 'product'
        ? getProductReturnScreen(state)
        : BACK_SCREENS[state.screen];
      if (!screen) return state;
      return withScreen(state, screen, {
        selectedProductId: state.screen === 'product' ? '' : state.selectedProductId,
        productReturnScreen: state.screen === 'product' ? 'catalog' : state.productReturnScreen,
      });
    }

    case 'RESET':
      return resetKioskState();

    default:
      return state;
  }
};
