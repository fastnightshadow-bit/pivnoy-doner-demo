import { loadCart, saveCart } from './cart-storage.js';
import {
  createCheckoutSummary,
  createTimeSlots,
  formatPhoneInput,
  getCheckoutFieldOrder,
  normalizeDeliveryAddress,
  validateCheckout,
} from './checkout-state.js';
import {
  loadFulfillment,
  saveFulfillment,
} from './fulfillment-storage.js';
import { pulseMotion, revealMotion } from './motion.js';
import { createOrderSnapshot } from './order-state.js';
import {
  loadActiveOrder,
  saveActiveOrder,
  saveActiveOrderId,
} from './order-storage.js';
import { loadPayment, savePayment } from './payment-storage.js';
import { getPromoResult } from './promo-state.js';
import { getDeliveryMinimumRemaining } from './delivery-policy.js';
import { createPreparationEta } from './preparation-time.js';
import {
  clearPromo,
  loadPromo,
  savePromo,
} from './promo-storage.js';
import { clientApi } from './client-api.js';
import { useProductionApi } from './runtime-mode.js';

const CHECKOUT_ATTEMPT_STORAGE_KEY = 'pivnoy-doner-checkout-attempt-v1';

export const createCheckoutOrderPayload = ({
  lines = [],
  fulfillment = 'pickup',
  customerName = '',
  phone = '',
  address = {},
  courierComment = '',
} = {}) => ({
  fulfillment: fulfillment === 'delivery' ? 'delivery' : 'pickup',
  customer: {
    name: String(customerName || '').trim(),
    phone: String(phone || '').trim(),
  },
  ...(fulfillment === 'delivery' ? { address } : {}),
  courierComment: String(courierComment || '').trim(),
  items: (Array.isArray(lines) ? lines : []).map((line) => ({
    productId: String(line.productId || ''),
    quantity: Math.max(1, Number(line.quantity) || 1),
    meat: String(line.meat || ''),
    size: String(line.size || ''),
    addons: line.addons || {},
    sauces: line.sauces || {},
  })),
});

export const getCheckoutAttemptKey = (
  storage,
  payload,
  {
    randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto),
    now = Date.now,
  } = {},
) => {
  const fingerprint = JSON.stringify(payload);
  try {
    const saved = JSON.parse(
      storage?.getItem?.(CHECKOUT_ATTEMPT_STORAGE_KEY) || 'null',
    );
    if (saved?.fingerprint === fingerprint && saved?.key) return saved.key;
  } catch {
    // A damaged retry marker is replaced below.
  }
  const suffix =
    typeof randomUUID === 'function'
      ? randomUUID()
      : `${now()}-${Math.random().toString(36).slice(2)}`;
  const key = `checkout-${suffix}`;
  storage?.setItem?.(
    CHECKOUT_ATTEMPT_STORAGE_KEY,
    JSON.stringify({ fingerprint, key }),
  );
  return key;
};

const clearCheckoutAttempt = (storage) =>
  storage?.removeItem?.(CHECKOUT_ATTEMPT_STORAGE_KEY);

export const formatCheckoutPrice = (value) =>
  `${Math.max(0, Number(value) || 0).toLocaleString('ru-RU')}\u00a0₽`;

export const createTimeOptionsMarkup = (slots) =>
  [
    '<option value="">Выберите время</option>',
    ...(Array.isArray(slots) ? slots : []).map(
      (slot) => `<option value="${slot}">${slot}</option>`,
    ),
  ].join('');

export const createCheckoutOrderLineMarkup = (line = {}) => ({
  name: String(line.name || 'Блюдо'),
  quantity: Math.max(1, Number(line.quantity) || 1),
  total:
    Math.max(0, Number(line.unitPrice) || 0) *
    Math.max(1, Number(line.quantity) || 1),
});

const DELIVERY_ADDRESS_STORAGE_KEY = 'pivnoy-doner-delivery-address-v1';

export const loadDeliveryAddress = (storage) => {
  try {
    return normalizeDeliveryAddress(
      JSON.parse(storage?.getItem?.(DELIVERY_ADDRESS_STORAGE_KEY) || '{}'),
    );
  } catch {
    return normalizeDeliveryAddress();
  }
};

export const saveDeliveryAddress = (storage, address) => {
  const normalized = normalizeDeliveryAddress(address);
  storage?.setItem?.(
    DELIVERY_ADDRESS_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  return normalized;
};

export const copyText = async (
  value,
  {
    navigatorRef = globalThis.navigator,
    documentRef = globalThis.document,
  } = {},
) => {
  try {
    if (navigatorRef?.clipboard?.writeText) {
      await navigatorRef.clipboard.writeText(value);
      return true;
    }
  } catch {
    // На локальном адресе по Wi-Fi Clipboard API может быть недоступен.
  }

  if (!documentRef?.body || !documentRef.createElement) return false;
  const textarea = documentRef.createElement('textarea');
  textarea.value = String(value ?? '');
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  documentRef.body.append(textarea);
  textarea.select();

  try {
    return Boolean(documentRef.execCommand?.('copy'));
  } finally {
    textarea.remove();
  }
};

const initCheckout = () => {
  const form = document.querySelector('[data-checkout-form]');
  if (!form) return;

  const emptyState = document.querySelector('[data-empty-checkout]');
  const pickupPanel = document.querySelector('[data-pickup-panel]');
  const deliveryPanel = document.querySelector('[data-delivery-panel]');
  const fulfillmentButtons = [
    ...document.querySelectorAll('[data-fulfillment]'),
  ];
  const timeButtons = [...document.querySelectorAll('[data-time-mode]')];
  const paymentButtons = [...document.querySelectorAll('[data-payment]')];
  const timeSelectField = document.querySelector('[data-time-select]');
  const timeSelect = document.querySelector('[data-time-options]');
  const customerNameInput = document.querySelector('[data-customer-name]');
  const phoneInput = document.querySelector('[data-phone]');
  const courierComment = document.querySelector(
    '[name="courierComment"]',
  );
  const addressInput = document.querySelector('[data-address]');
  const addressPanel = document.querySelector('[data-field="address"]');
  const addressToggle = document.querySelector('[data-address-toggle]');
  const addressDetails = document.querySelector('[data-address-details]');
  const addressSummary = document.querySelector('[data-address-summary]');
  const addressStreet = document.querySelector('[data-address-street]');
  const addressEntrance = document.querySelector('[data-address-entrance]');
  const addressFloor = document.querySelector('[data-address-floor]');
  const addressApartment = document.querySelector('[data-address-apartment]');
  const addressIntercom = document.querySelector('[data-address-intercom]');
  const promoToggle = document.querySelector('[data-promo-toggle]');
  const promoPanel = document.querySelector('[data-promo-panel]');
  const promoInput = document.querySelector('[data-promo-input]');
  const promoApply = document.querySelector('[data-promo-apply]');
  const promoMessage = document.querySelector('[data-promo-message]');
  const itemsTotal = document.querySelector('[data-items-total]');
  const deliveryTotal = document.querySelector('[data-delivery-total]');
  const discountRow = document.querySelector('[data-discount-row]');
  const discountTotal = document.querySelector('[data-discount-total]');
  const grandTotal = document.querySelector('[data-grand-total]');
  const checkoutTotal = document.querySelector('[data-checkout-total]');
  const orderLinesRoot = document.querySelector('[data-checkout-order-lines]');
  const confirmButton = document.querySelector('[data-confirm-order]');
  const toast = document.querySelector('[data-checkout-toast]');

  const lines = loadCart(window.localStorage);
  const retryId =
    new URLSearchParams(window.location.search).get('retry') || '';
  const storedOrder = loadActiveOrder(window.localStorage);
  const previousOrder = storedOrder?.id === retryId ? storedOrder : null;
  let promoCode = loadPromo(window.localStorage);
  const state = {
    fulfillment: loadFulfillment(window.localStorage),
    timeMode: 'asap',
    payment: loadPayment(window.localStorage),
  };
  let deliveryAddress = loadDeliveryAddress(window.localStorage);
  let toastTimer;

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 1900);
  };

  const readDeliveryAddress = () =>
    normalizeDeliveryAddress({
      street: addressStreet.value,
      entrance: addressEntrance.value,
      floor: addressFloor.value,
      apartment: addressApartment.value,
      intercom: addressIntercom.value,
    });

  const renderAddressSummary = () => {
    addressSummary.textContent =
      deliveryAddress.street || 'Улица и номер дома';
  };

  const setAddressExpanded = (expanded, { focus = false } = {}) => {
    addressToggle.setAttribute('aria-expanded', String(expanded));
    addressDetails.hidden = !expanded;
    addressPanel.classList.toggle('is-expanded', expanded);
    if (expanded) revealMotion(addressDetails);
    if (expanded && focus) {
      addressStreet.focus({ preventScroll: true });
    }
  };

  const getCheckoutData = () => ({
    fulfillment: state.fulfillment,
    timeMode: state.timeMode,
    phone: phoneInput.value,
    address: readDeliveryAddress(),
    selectedTime: timeSelect.value,
    itemsTotal: createCheckoutSummary(lines).items,
  });

  const getControl = (name) => {
    const controls = {
      phone: phoneInput,
      address: addressInput,
      selectedTime: timeSelect,
    };
    return controls[name];
  };

  const setFieldError = (name, message = '') => {
    const control = getControl(name);
    const field = document.querySelector(`[data-field="${name}"]`);
    const error = document.querySelector(`[data-error-for="${name}"]`);
    if (!control || !field || !error) return;

    field.classList.toggle('is-error', Boolean(message));
    control.setAttribute('aria-invalid', String(Boolean(message)));
    error.textContent = message;
    if (message) {
      if (name === 'address') setAddressExpanded(true);
      revealMotion(error);
    }
  };

  const validateField = (name) => {
    const errors = validateCheckout(getCheckoutData());
    setFieldError(name, errors[name] || '');
    return !errors[name];
  };

  const renderTimeMode = () => {
    timeButtons.forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.timeMode === state.timeMode),
      );
    });
    timeSelectField.hidden = state.timeMode !== 'scheduled';
    if (state.timeMode === 'asap') {
      timeSelect.value = '';
      setFieldError('selectedTime');
    }
  };

  const renderFulfillment = () => {
    fulfillmentButtons.forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.fulfillment === state.fulfillment),
      );
    });
    pickupPanel.hidden = state.fulfillment !== 'pickup';
    deliveryPanel.hidden = state.fulfillment !== 'delivery';

    if (state.fulfillment === 'pickup') {
      state.timeMode = 'asap';
      setFieldError('address');
      renderTimeMode();
    }
  };

  const renderPayment = () => {
    paymentButtons.forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.payment === state.payment),
      );
    });
  };

  const renderPromoMessage = (result) => {
    promoMessage.dataset.status = result.status;
    promoMessage.textContent = result.message;
  };

  const renderOrderLines = () => {
    if (!orderLinesRoot) return;
    const nodes = lines.map(createCheckoutOrderLineMarkup).map((item) => {
      const row = document.createElement('div');
      const description = document.createElement('span');
      const price = document.createElement('strong');
      row.className = 'checkout-order-line';
      description.textContent = `${item.quantity} × ${item.name}`;
      price.textContent = formatCheckoutPrice(item.total);
      row.append(description, price);
      return row;
    });
    orderLinesRoot.replaceChildren(...nodes);
  };

  const renderSummary = () => {
    const summary = createCheckoutSummary(
      lines,
      promoCode,
      state.fulfillment,
    );
    const minimumRemaining = getDeliveryMinimumRemaining(
      summary.items,
      state.fulfillment,
    );
    itemsTotal.textContent = formatCheckoutPrice(summary.items);
    deliveryTotal.textContent = formatCheckoutPrice(summary.delivery);
    discountRow.hidden = summary.discount === 0;
    discountTotal.textContent = `−${formatCheckoutPrice(summary.discount)}`;
    grandTotal.textContent = formatCheckoutPrice(summary.total);
    checkoutTotal.textContent = formatCheckoutPrice(summary.total);
    confirmButton.disabled = minimumRemaining > 0;
    confirmButton.querySelector('span').textContent =
      minimumRemaining > 0
        ? `Добавьте ещё ${minimumRemaining.toLocaleString('ru-RU')} ₽`
        : 'Оплатить';

    pulseMotion(grandTotal);
    pulseMotion(checkoutTotal);
  };

  const applyPromo = () => {
    const baseSummary = createCheckoutSummary(lines);
    const result = getPromoResult(promoInput.value, baseSummary.items);
    if (result.status === 'applied') {
      promoCode = savePromo(window.localStorage, result.code);
      promoInput.value = result.code;
    } else {
      clearPromo(window.localStorage);
      promoCode = '';
    }
    renderPromoMessage(result);
    renderSummary();
  };

  const isEmpty = lines.length === 0;
  form.hidden = isEmpty;
  emptyState.hidden = !isEmpty;
  if (isEmpty) return;

  timeSelect.innerHTML = createTimeOptionsMarkup(createTimeSlots(new Date(), 6));
  addressStreet.value = deliveryAddress.street;
  addressEntrance.value = deliveryAddress.entrance;
  addressFloor.value = deliveryAddress.floor;
  addressApartment.value = deliveryAddress.apartment;
  addressIntercom.value = deliveryAddress.intercom;
  renderAddressSummary();
  promoInput.value = promoCode;
  if (promoCode) {
    renderPromoMessage(
      getPromoResult(promoCode, createCheckoutSummary(lines).items),
    );
  }
  renderFulfillment();
  renderTimeMode();
  renderPayment();
  renderOrderLines();
  renderSummary();

  fulfillmentButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.fulfillment = saveFulfillment(
        window.localStorage,
        button.dataset.fulfillment,
      );
      renderFulfillment();
      revealMotion(
        state.fulfillment === 'pickup' ? pickupPanel : deliveryPanel,
      );
      renderSummary();
    });
  });

  timeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.timeMode = button.dataset.timeMode;
      renderTimeMode();
      if (state.timeMode === 'scheduled') {
        revealMotion(timeSelectField);
        window.setTimeout(() => timeSelect.focus(), 180);
      }
    });
  });

  paymentButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.payment = savePayment(
        window.localStorage,
        button.dataset.payment,
      );
      renderPayment();
      pulseMotion(button);
    });
  });

  promoToggle.addEventListener('click', () => {
    const willOpen = promoPanel.hidden;
    promoPanel.hidden = !willOpen;
    promoToggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
      revealMotion(promoPanel);
      window.setTimeout(() => promoInput.focus(), 120);
    }
  });

  promoApply.addEventListener('click', applyPromo);
  promoInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyPromo();
  });
  promoInput.addEventListener('input', () => {
    if (promoMessage.textContent) {
      promoMessage.textContent = '';
      delete promoMessage.dataset.status;
    }
  });

  phoneInput.addEventListener('input', () => {
    const caretAtEnd = phoneInput.selectionStart === phoneInput.value.length;
    phoneInput.value = formatPhoneInput(phoneInput.value);
    if (caretAtEnd) {
      phoneInput.setSelectionRange(
        phoneInput.value.length,
        phoneInput.value.length,
      );
    }
    setFieldError('phone');
  });

  addressToggle.addEventListener('click', () => {
    const willOpen = addressDetails.hidden;
    setAddressExpanded(willOpen, { focus: willOpen });
  });

  [
    addressStreet,
    addressEntrance,
    addressFloor,
    addressApartment,
    addressIntercom,
  ].forEach((input) => {
    input.addEventListener('input', () => {
      deliveryAddress = saveDeliveryAddress(
        window.localStorage,
        readDeliveryAddress(),
      );
      renderAddressSummary();
      if (input === addressStreet) setFieldError('address');
    });
  });

  [
    ['phone', phoneInput],
    ['address', addressInput],
    ['selectedTime', timeSelect],
  ].forEach(([name, control]) => {
    control.addEventListener('blur', () => validateField(name));
    if (name !== 'phone') {
      control.addEventListener('input', () => setFieldError(name));
      control.addEventListener('change', () => setFieldError(name));
    }
  });

  document.querySelectorAll('[data-copy-address]').forEach((button) => {
    button.addEventListener('click', async () => {
      const address = button.dataset.copyAddress;
      const copied = await copyText(address);
      showToast(copied ? 'Адрес скопирован' : address);
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errors = validateCheckout(getCheckoutData());
    const order = getCheckoutFieldOrder(
      state.fulfillment,
      state.timeMode,
    );

    ['address', 'phone', 'selectedTime'].forEach((name) =>
      setFieldError(name, errors[name] || ''),
    );
    const firstError = order.find((name) => errors[name]);
    if (errors.order) {
      showToast(errors.order);
      return;
    }
    if (firstError) {
      if (firstError === 'address') {
        setAddressExpanded(true);
      }
      const control = getControl(firstError);
      control.focus();
      control.closest('[data-field]')?.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
          .matches
          ? 'auto'
          : 'smooth',
        block: 'center',
      });
      showToast('Проверьте обязательные поля');
      return;
    }

    const summary = createCheckoutSummary(
      lines,
      promoCode,
      state.fulfillment,
    );
    const snapshotInput = {
      lines,
      summary,
      fulfillment: state.fulfillment,
      payment: state.payment,
      customerName: customerNameInput?.value || '',
      phone: phoneInput.value,
      address: readDeliveryAddress(),
      comment: courierComment?.value || '',
      selectedTime:
        state.timeMode === 'scheduled' ? timeSelect.value : '',
      eta: createPreparationEta(lines),
      previousOrder,
    };

    confirmButton.classList.add('is-loading');
    confirmButton.disabled = true;
    if (!useProductionApi()) {
      const activeOrder = createOrderSnapshot(snapshotInput);
      saveActiveOrder(window.localStorage, activeOrder);
      saveCart(window.localStorage, []);
      window.setTimeout(() => {
        window.location.href = 'order.html';
      }, 220);
      return;
    }

    const payload = createCheckoutOrderPayload({
      lines,
      fulfillment: state.fulfillment,
      customerName: customerNameInput?.value || '',
      phone: phoneInput.value,
      address: readDeliveryAddress(),
      courierComment: courierComment?.value || '',
    });
    const attemptKey = getCheckoutAttemptKey(
      window.sessionStorage,
      payload,
    );

    try {
      const order = await clientApi.createOrder(payload, attemptKey);
      saveActiveOrderId(window.localStorage, order.id);
      saveCart(window.localStorage, []);
      clearCheckoutAttempt(window.sessionStorage);
      window.location.href =
        order.payment?.confirmationUrl || 'order.html';
    } catch (error) {
      confirmButton.classList.remove('is-loading');
      confirmButton.disabled = false;
      if (error?.code === 'MINIMUM_ORDER') {
        showToast('Минимальная сумма доставки — 300 ₽');
      } else if (error?.code === 'PRODUCT_NOT_SALEABLE') {
        showToast('Один из товаров временно недоступен');
      } else {
        showToast('Не удалось оформить заказ. Проверьте интернет и повторите.');
      }
    }
  });
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckout, { once: true });
  } else {
    initCheckout();
  }
}
