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
import { normalizeOptionQuantities } from './option-quantities.js';
import {
  getKioskAvailability,
  reconcileKioskCart,
} from './kiosk-availability.js';
import { createKioskState, reduceKioskState } from './kiosk-state.js';
import {
  createDemoKioskApi,
  createKioskApi,
  isKioskDemoLocation,
} from './kiosk-api.js';
import { renderKioskCart } from './kiosk-cart-presentation.js';
import { renderKioskPayment } from './kiosk-payment-presentation.js';
import { renderKiosk } from './kiosk-presentation.js';
import { createKioskImageCache } from './kiosk-image-cache.js';
import { createKioskPaymentController } from './kiosk-payment-flow.js';
import { renderKioskActivation } from './kiosk-activation-presentation.js';
import { LEGAL_VERSIONS } from './shared/legal.js?v=20260811';

const root = document.querySelector('[data-kiosk-app]');
const isDemo = isKioskDemoLocation(window.location);
const api = isDemo ? createDemoKioskApi() : createKioskApi();
const imageCache = createKioskImageCache();
const paymentController = createKioskPaymentController({ api });
let state = createKioskState();
let paymentPollTimer = 0;
let context = {
  products: [],
  activeCategory: 'shawarma',
  selection: null,
  editingLineId: '',
  paymentPending: false,
  terminalState: '',
  qrSvg: '',
  fiscalPhone: '',
  personalDataConsent: false,
  paymentFormError: '',
  notice: '',
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
    sauces: {},
    addons: {},
    quantity: 1,
  };
};

const createLineSelection = (line) => ({
  meat: line.meat || getAvailableMeats(line.productId)[0] || 'default',
  size: line.size || 'single',
  sauces: normalizeOptionQuantities(line.sauces),
  addons: normalizeOptionQuantities(line.addons),
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

const openCartLine = async (lineId) => {
  const line = state.lines.find((item) => item.lineId === lineId);
  if (!line) return;
  await imageCache.ensure(line.image || findProduct(line.productId)?.image);
  context = {
    ...context,
    selection: createLineSelection(line),
    editingLineId: line.lineId,
  };
  dispatch({ type: 'OPEN_PRODUCT', productId: line.productId });
};

const startPayment = async (method) => {
  if (method === 'card') {
    dispatch({ type: 'SELECT_PAYMENT', value: 'card' });
    paymentController.showCardAnimation((terminalState) => {
      if (state.screen !== 'card-payment') return;
      context = { ...context, terminalState };
      render();
    });
    return;
  }

  const phoneDigits = String(context.fiscalPhone || '').replace(/\D/g, '');
  if (![10, 11].includes(phoneDigits.length) || !context.personalDataConsent) {
    context = {
      ...context,
      paymentFormError: ![10, 11].includes(phoneDigits.length)
        ? 'Введите корректный номер телефона для чека'
        : 'Подтвердите согласие для формирования чека',
    };
    render();
    return;
  }

  dispatch({ type: 'SELECT_PAYMENT', value: method });
  context = { ...context, paymentPending: true, qrSvg: '', paymentFormError: '' };
  render();
  try {
    const operationId =
      globalThis.crypto?.randomUUID?.() ||
      `kiosk-${Date.now()}-${Math.random()}`;
    const result = await paymentController.createQrOrder(
      {
        serviceMode: state.fulfillment === 'dine-in' ? 'dine_in' : 'takeaway',
        fiscalPhone: context.fiscalPhone,
        personalDataConsent: true,
        personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
        offerVersion: LEGAL_VERSIONS.offer,
        items: state.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          meat: line.meat,
          size: line.size,
          addons: line.addons,
          sauces: line.sauces,
        })),
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
      qrSvg: result.qrSvg || '',
      paymentPending: false,
    };
    render();
    const poll = async () => {
      if (state.screen !== 'qr-payment' || !state.order?.id) return;
      try {
        const status = await paymentController.getPaymentStatus(state.order.id);
        if (status.payment?.status === 'paid') {
          dispatch({ type: 'PAYMENT_SUCCEEDED', payment: status.payment });
          return;
        }
        if (status.payment?.status === 'failed') {
          dispatch({ type: 'PAYMENT_FAILED', error: 'Оплата не завершена' });
          return;
        }
      } catch {
        context = { ...context, connected: false };
        render();
      }
      paymentPollTimer = setTimeout(poll, 2500);
    };
    paymentPollTimer = setTimeout(poll, isDemo ? 900 : 2500);
  } catch (error) {
    context = { ...context, paymentPending: false };
    dispatch({
      type: 'PAYMENT_FAILED',
      error: error?.message || 'Оплата не прошла',
    });
  }
};

root.addEventListener('click', async (event) => {
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
    await imageCache.ensure(findProduct(productId)?.image);
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

  const optionButton = event.target.closest(
    '[data-kiosk-addon-change], [data-kiosk-sauce-change]',
  );
  if (optionButton) {
    const kind = optionButton.hasAttribute('data-kiosk-addon-change')
      ? 'addons'
      : 'sauces';
    const optionId = optionButton.dataset.kioskAddonChange ||
      optionButton.dataset.kioskSauceChange;
    const current = normalizeOptionQuantities(context.selection[kind]);
    const nextQuantity = Math.max(
      0,
      Math.min(5, (current[optionId] || 0) + Number(optionButton.dataset.delta)),
    );
    if (nextQuantity) current[optionId] = nextQuantity;
    else delete current[optionId];
    updateSelection({ [kind]: current });
    return;
  }

  const quickAdd = event.target.closest('[data-kiosk-quick-add]');
  if (quickAdd) {
    const product = findProduct(quickAdd.dataset.kioskQuickAdd);
    if (!product) return;
    const selection = createDefaultSelection(product.id);
    state = reduceKioskState(state, {
      type: 'SET_LINES',
      lines: addCartLine(state.lines, createCartLine({
        productId: product.id,
        name: product.name,
        unitPrice: calculateProductPrice(product.id, selection),
        ...selection,
        quantity: 1,
        image: product.image,
        icon: product.icon,
      })),
    });
    context = { ...context, notice: `${product.name} добавлен в корзину` };
    render();
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
      sauces: selection.sauces,
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
    await openCartLine(editLine.dataset.kioskEditLine);
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
    context = {
      ...context,
      fiscalPhone: root.querySelector('[data-kiosk-fiscal-phone]')?.value || context.fiscalPhone,
      personalDataConsent: root.querySelector('[data-kiosk-personal-consent]')?.checked || false,
    };
    startPayment(payment.dataset.kioskPayment);
    return;
  }

  if (event.target.closest('[data-kiosk-use-qr]')) {
    paymentController.stopCardAnimation();
    state = { ...state, screen: 'payment-method', error: '' };
    render();
    return;
  }

  if (event.target.closest('[data-kiosk-payment-retry]')) {
    state = { ...state, screen: 'payment-method', error: '' };
    render();
    return;
  }

  if (event.target.closest('[data-kiosk-reset]')) {
    clearTimeout(paymentPollTimer);
    paymentController.stopCardAnimation();
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
    paymentController.stopCardAnimation();
    dispatch({ type: 'BACK' });
  }
});

root.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-kiosk-activation-form]');
  if (!form) return;
  event.preventDefault();
  const code = form.querySelector('[data-kiosk-activation-code]')?.value || '';
  const displayName = form.querySelector('[data-kiosk-device-name]')?.value || '';
  root.innerHTML = renderKioskActivation({ pending: true });
  try {
    await api.activateDevice(code, displayName);
    await start();
  } catch {
    root.innerHTML = renderKioskActivation({
      error: 'Код не подошёл или уже использован',
    });
  }
});

root.addEventListener('keydown', async (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const editLine = event.target.closest('[data-kiosk-edit-line]');
  if (!editLine) return;
  event.preventDefault();
  await openCartLine(editLine.dataset.kioskEditLine);
});

const start = async () => {
  try {
    const bootstrap = await api.getBootstrap();
    context = { ...context, ...bootstrap };
    render();
    void imageCache.preloadProducts(
      context.products?.length ? context.products : PRODUCTS,
    );
    api.subscribe(
      (message) => {
        if (message.type === 'settings.updated') {
          const reconciled = reconcileKioskCart(
            state.lines,
            message.settings,
            context.products?.length ? context.products : PRODUCTS,
          );
          state = { ...state, lines: reconciled.lines };
          context = {
            ...context,
            settings: message.settings,
            notice: reconciled.changed
              ? 'Меню обновилось: недоступные позиции удалены из корзины'
              : context.notice,
          };
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
    if (error?.status === 401 && !isDemo) {
      root.innerHTML = renderKioskActivation();
      return;
    }
    root.innerHTML = `<section class="kiosk-fatal" role="alert"><img src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" /><h1>Не удалось загрузить меню</h1><p>${String(error?.message || 'Проверьте подключение к интернету')}</p><button class="kiosk-primary kiosk-touch" type="button" onclick="location.reload()">Повторить</button></section>`;
  }
};

start();
