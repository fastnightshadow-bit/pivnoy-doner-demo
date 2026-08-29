import { PRODUCTS } from './catalog-data.js';
import {
  addCartLine,
  changeCartLineQuantity,
  createCartLine,
  removeCartLine,
} from './cart-state.js';
import {
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  getProductConfiguration,
} from './product-config.js';
import { createKioskState, reduceKioskState } from './kiosk-state.js';
import {
  createDemoKioskApi,
  createKioskApi,
  isKioskDemoLocation,
} from './kiosk-api.js';
import { renderKioskCart } from './kiosk-cart-presentation.js';
import { renderKioskPayment } from './kiosk-payment-presentation.js';
import { getKioskAvailability, renderKiosk } from './kiosk-presentation.js';

const root = document.querySelector('[data-kiosk-app]');
const isDemo = isKioskDemoLocation(window.location);
const api = isDemo ? createDemoKioskApi() : createKioskApi();
let state = createKioskState();
let context = {
  products: [],
  activeCategory: 'shawarma',
  selection: null,
  editingLineId: '',
  paymentPending: false,
  settings: {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  },
  connected: true,
};
let renderedScreen = '';
const paymentScreens = new Set([
  'payment-method',
  'card-payment',
  'qr-payment',
  'success',
  'error',
]);

const render = () => {
  const viewContext = {
    ...context,
    animateProductEntry:
      state.screen === 'product' && renderedScreen !== 'product',
  };
  root.innerHTML = state.screen === 'cart'
    ? renderKioskCart(state, viewContext)
    : paymentScreens.has(state.screen)
      ? renderKioskPayment(state, viewContext)
      : renderKiosk(state, viewContext);
  renderedScreen = state.screen;
};

const dispatch = (event) => {
  const next = reduceKioskState(state, event);
  if (next === state) return;
  state = next;
  render();
};

const findProduct = (id) =>
  (context.products?.length ? context.products : PRODUCTS).find(
    (product) => product.id === id,
  );

const createDefaultSelection = (productId) => {
  const meats = getAvailableMeats(productId);
  const meat =
    meats.find(
      (id) => !(context.settings.stoppedMeatIds || []).includes(id),
    ) || meats[0] || 'default';
  return {
    meat,
    size: getAvailableSizes(productId, meat)[0] || 'single',
    sauce: '',
    addons: [],
    quantity: 1,
  };
};

const createLineSelection = (line) => ({
  meat: line.meat || getAvailableMeats(line.productId)[0] || 'default',
  size: line.size || 'single',
  sauce: line.sauce || '',
  addons: Array.isArray(line.addons) ? [...line.addons] : [],
  quantity: Math.max(1, Number(line.quantity) || 1),
});

const updateSelection = (changes) => {
  context = {
    ...context,
    selection: { ...context.selection, ...changes },
  };
  render();
};

const closeProduct = () => {
  context = { ...context, selection: null, editingLineId: '' };
  dispatch({ type: 'CLOSE_PRODUCT' });
};

const openCartLine = (lineId) => {
  const line = state.lines.find((item) => item.lineId === lineId);
  if (!line) return;
  context = {
    ...context,
    selection: createLineSelection(line),
    editingLineId: line.lineId,
  };
  dispatch({ type: 'OPEN_PRODUCT', productId: line.productId });
};

const startPayment = async (method) => {
  dispatch({ type: 'SELECT_PAYMENT', value: method });
  context = { ...context, paymentPending: true };
  render();
  try {
    const operationId =
      globalThis.crypto?.randomUUID?.() ||
      `kiosk-${Date.now()}-${Math.random()}`;
    const result = await api.createOrder(
      {
        fulfillment: state.fulfillment,
        paymentMethod: method,
        source: 'kiosk',
        lines: state.lines,
      },
      operationId,
    );
    state = {
      ...state,
      order: result.order,
      payment: result.payment || null,
    };
    context = {
      ...context,
      qrValue:
        result.payment?.confirmationUrl || result.payment?.qrCodeData || '',
      paymentPending: false,
    };
    render();
    if (result.payment?.confirmationUrl && method === 'card') {
      window.location.assign(result.payment.confirmationUrl);
    }
    if (isDemo || result.payment?.status === 'succeeded') {
      setTimeout(
        () =>
          dispatch({
            type: 'PAYMENT_SUCCEEDED',
            payment: result.payment || { status: 'succeeded' },
          }),
        isDemo ? 1400 : 0,
      );
    }
  } catch (error) {
    context = { ...context, paymentPending: false };
    dispatch({
      type: 'PAYMENT_FAILED',
      error: error?.message || 'Оплата не прошла',
    });
  }
};

root.addEventListener('click', (event) => {
  if (event.target.closest('[data-kiosk-start]')) {
    dispatch({ type: 'START' });
    return;
  }

  const fulfillment = event.target.closest('[data-kiosk-fulfillment]');
  if (fulfillment) {
    dispatch({
      type: 'SET_FULFILLMENT',
      value: fulfillment.dataset.kioskFulfillment,
    });
    return;
  }

  const category = event.target.closest('[data-kiosk-category]');
  if (category) {
    context = {
      ...context,
      activeCategory: category.dataset.kioskCategory,
    };
    render();
    return;
  }

  const productButton = event.target.closest('[data-kiosk-product]');
  if (productButton) {
    const productId = productButton.dataset.kioskProduct;
    context = {
      ...context,
      selection: createDefaultSelection(productId),
      editingLineId: '',
    };
    dispatch({ type: 'OPEN_PRODUCT', productId });
    return;
  }

  if (event.target.closest('[data-kiosk-close-product]')) {
    closeProduct();
    return;
  }

  const meat = event.target.closest('[data-kiosk-set-meat]');
  if (meat) {
    const value = meat.dataset.kioskSetMeat;
    updateSelection({
      meat: value,
      size: getAvailableSizes(state.selectedProductId, value)[0] || 'single',
    });
    return;
  }

  const size = event.target.closest('[data-kiosk-set-size]');
  if (size) {
    updateSelection({ size: size.dataset.kioskSetSize });
    return;
  }

  const sauce = event.target.closest('[data-kiosk-set-sauce]');
  if (sauce) {
    updateSelection({ sauce: sauce.dataset.kioskSetSauce });
    return;
  }

  const addon = event.target.closest('[data-kiosk-toggle-addon]');
  if (addon) {
    const value = addon.dataset.kioskToggleAddon;
    const current = context.selection.addons || [];
    updateSelection({
      addons: current.includes(value)
        ? current.filter((id) => id !== value)
        : [...current, value],
    });
    return;
  }

  const productQuantity = event.target.closest(
    '[data-kiosk-product-quantity]',
  );
  if (productQuantity) {
    updateSelection({
      quantity: Math.max(
        1,
        (context.selection.quantity || 1) +
          Number(productQuantity.dataset.kioskProductQuantity),
      ),
    });
    return;
  }

  if (event.target.closest('[data-kiosk-add-line]')) {
    const product = findProduct(state.selectedProductId);
    const selection = context.selection;
    if (
      !getKioskAvailability(product, selection, context.settings).available
    ) {
      return;
    }
    const line = createCartLine({
      productId: product.id,
      name: product.name,
      unitPrice: calculateProductPrice(product.id, selection),
      meat: selection.meat,
      size: selection.size,
      sauce: selection.sauce,
      addons: selection.addons,
      quantity: selection.quantity,
      image: product.image,
      icon: product.icon,
    });
    const currentLines = context.editingLineId
      ? removeCartLine(state.lines, context.editingLineId)
      : state.lines;
    state = reduceKioskState(state, {
      type: 'SET_LINES',
      lines: addCartLine(currentLines, line),
    });
    closeProduct();
    return;
  }

  const lineQuantity = event.target.closest('[data-kiosk-change-line]');
  if (lineQuantity) {
    dispatch({
      type: 'SET_LINES',
      lines: changeCartLineQuantity(
        state.lines,
        lineQuantity.dataset.kioskChangeLine,
        Number(lineQuantity.dataset.delta),
      ),
    });
    return;
  }

  const editLine = event.target.closest('[data-kiosk-edit-line]');
  if (editLine) {
    openCartLine(editLine.dataset.kioskEditLine);
    return;
  }

  if (event.target.closest('[data-kiosk-cart]')) {
    dispatch({ type: 'OPEN_CART' });
    return;
  }
  if (event.target.closest('[data-kiosk-checkout]')) {
    dispatch({ type: 'OPEN_PAYMENT_METHOD' });
    return;
  }

  const payment = event.target.closest('[data-kiosk-payment]');
  if (payment) {
    startPayment(payment.dataset.kioskPayment);
    return;
  }

  if (event.target.closest('[data-kiosk-payment-retry]')) {
    state = { ...state, screen: 'payment-method', error: '' };
    render();
    return;
  }

  if (event.target.closest('[data-kiosk-reset]')) {
    state = createKioskState();
    context = {
      ...context,
      selection: null,
      editingLineId: '',
      activeCategory: 'shawarma',
    };
    render();
    return;
  }

  if (event.target.closest('[data-kiosk-back]')) {
    dispatch({ type: 'BACK' });
  }
});

root.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const editLine = event.target.closest('[data-kiosk-edit-line]');
  if (!editLine) return;
  event.preventDefault();
  openCartLine(editLine.dataset.kioskEditLine);
});

const start = async () => {
  try {
    const bootstrap = await api.getBootstrap();
    context = { ...context, ...bootstrap };
    render();
    api.subscribe(
      (message) => {
        if (message.type === 'settings.updated') {
          context = { ...context, settings: message.settings };
          if (
            state.screen === 'product' &&
            !getKioskAvailability(
              findProduct(state.selectedProductId),
              context.selection,
              context.settings,
            ).available
          ) {
            closeProduct();
          }
          render();
        }
        if (
          message.type === 'payment.succeeded' &&
          state.order?.id === message.orderId
        ) {
          dispatch({
            type: 'PAYMENT_SUCCEEDED',
            payment: message.payment,
          });
        }
      },
      (connected) => {
        context = { ...context, connected };
        render();
      },
    );
  } catch (error) {
    root.innerHTML = `<section class="kiosk-fatal" role="alert"><img src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" /><h1>Не удалось загрузить меню</h1><p>${String(error?.message || 'Проверьте подключение к интернету')}</p><button class="kiosk-primary kiosk-touch" type="button" onclick="location.reload()">Повторить</button></section>`;
  }
};

start();