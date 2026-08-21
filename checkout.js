import { loadCart, saveCart } from './cart-storage.js';
import {
  createCheckoutSummary,
  createTimeSlots,
  formatPhoneInput,
  getCheckoutFieldOrder,
  normalizeDeliveryAddress,
  validateCheckout,
} from './checkout-state.js?v=20260811';
import {
  loadFulfillment,
  saveFulfillment,
} from './fulfillment-storage.js';
import { pulseMotion, revealMotion } from './motion.js';
import { createOrderSnapshot } from './order-state.js';
import {
  loadActiveOrder,
  saveActiveOrder,
  saveActiveOrderAccess,
} from './order-storage.js?v=2026081402';
import { loadPayment, savePayment } from './payment-storage.js';
import { getPromoResult } from './promo-state.js';
import { getDeliveryMinimumRemaining } from './delivery-policy.js';
import { createPreparationEta } from './preparation-time.js';
import {
  clearPromo,
  loadPromo,
  savePromo,
} from './promo-storage.js';
import { clientApi } from './client-api.js?v=2026081402';
import { useProductionApi } from './runtime-mode.js';
import { LEGAL_VERSIONS } from './shared/legal.js?v=20260811';
import {
  getAvailableMeats,
  isProductAvailableForMeats,
  MEAT_LABELS,
  PRODUCT_ADDONS,
  PRODUCT_SAUCES,
} from './product-config.js';

const CHECKOUT_ATTEMPT_STORAGE_KEY = 'pivnoy-doner-checkout-attempt-v1';

export const createCheckoutOrderPayload = ({
  lines = [],
  fulfillment = 'pickup',
  customerName = '',
  phone = '',
  address = {},
  courierComment = '',
  personalDataConsent = false,
} = {}) => ({
  fulfillment: fulfillment === 'delivery' ? 'delivery' : 'pickup',
  customer: {
    name: String(customerName || '').trim(),
    phone: String(phone || '').trim(),
  },
  ...(fulfillment === 'delivery' ? { address } : {}),
  courierComment: String(courierComment || '').trim(),
  personalDataConsent: personalDataConsent === true,
  personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
  offerVersion: LEGAL_VERSIONS.offer,
  items: (Array.isArray(lines) ? lines : []).map((line) => ({
    productId: String(line.productId || ''),
    quantity: Math.max(1, Number(line.quantity) || 1),
    meat: getCheckoutLineMeatId(line),
    size: String(line.size || ''),
    addons: line.addons || {},
    sauces: line.sauces || {},
  })),
});

const getCheckoutOrderIdentity = (payload) => {
  const {
    personalDataConsent: _personalDataConsent,
    personalDataConsentVersion: _personalDataConsentVersion,
    offerVersion: _offerVersion,
    ...orderIdentity
  } = payload && typeof payload === 'object' ? payload : {};
  return orderIdentity;
};

const sortObjectKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = sortObjectKeys(value[key]);
      return result;
    }, {});
};

export const createCheckoutAttemptDigest = async (
  payload,
  {
    cryptoRef = globalThis.crypto,
    TextEncoderRef = globalThis.TextEncoder,
  } = {},
) => {
  if (!cryptoRef?.subtle?.digest || typeof TextEncoderRef !== 'function') {
    throw new Error('SHA-256 checkout digest is unavailable');
  }

  const identity = JSON.stringify(
    sortObjectKeys(getCheckoutOrderIdentity(payload)),
  );
  const digest = await cryptoRef.subtle.digest(
    'SHA-256',
    new TextEncoderRef().encode(identity),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const getCheckoutAttemptKey = async (
  storage,
  payload,
  {
    randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto),
    now = Date.now,
    cryptoRef = globalThis.crypto,
    TextEncoderRef = globalThis.TextEncoder,
  } = {},
) => {
  const orderIdentity = getCheckoutOrderIdentity(payload);
  const legacyFingerprint = JSON.stringify(orderIdentity);
  let digest;
  try {
    digest = await createCheckoutAttemptDigest(payload, {
      cryptoRef,
      TextEncoderRef,
    });
  } catch (error) {
    try {
      storage?.removeItem?.(CHECKOUT_ATTEMPT_STORAGE_KEY);
    } catch {
      // The checkout remains fail-closed even when storage cannot be cleaned.
    }
    throw error;
  }
  let saved = null;
  try {
    saved = JSON.parse(
      storage?.getItem?.(CHECKOUT_ATTEMPT_STORAGE_KEY) || 'null',
    );
  } catch {
    // A damaged retry marker is replaced below.
  }

  const savedKey = String(saved?.key || '').trim();
  if (
    savedKey &&
    (saved?.digest === digest || saved?.fingerprint === legacyFingerprint)
  ) {
    const createdAt = Number(saved?.createdAt) || Number(now());
    storage?.setItem?.(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
      JSON.stringify({ digest, key: savedKey, createdAt }),
    );
    return savedKey;
  }

  const createdAt = Number(now());
  const suffix =
    typeof randomUUID === 'function'
      ? randomUUID()
      : `${createdAt}-${Math.random().toString(36).slice(2)}`;
  const key = `checkout-${suffix}`;
  storage?.setItem?.(
    CHECKOUT_ATTEMPT_STORAGE_KEY,
    JSON.stringify({ digest, key, createdAt }),
  );
  return key;
};

export const getCheckoutValidationAction = (
  errors = {},
  fieldOrder = [],
) => {
  const focusField = errors.personalDataConsent
    ? 'personalDataConsent'
    : fieldOrder.find((name) => errors[name]);
  return {
    focusField,
    toast:
      errors.order || (focusField ? 'Проверьте обязательные поля' : ''),
  };
};

const clearCheckoutAttempt = (storage) =>
  storage?.removeItem?.(CHECKOUT_ATTEMPT_STORAGE_KEY);

export const saveCreatedOrderAccess = (storage, order = {}) => {
  const id = String(order.id || '').trim();
  const token = String(order.accessToken || '').trim();
  if (!id || !token) {
    const error = new Error('order-access-unavailable');
    error.code = 'ACTIVE_ORDER_ACCESS_STORAGE_FAILED';
    throw error;
  }
  try {
    return saveActiveOrderAccess(storage, { id, token });
  } catch (cause) {
    const error = new Error('active-order-access-storage-failed', { cause });
    error.code = 'ACTIVE_ORDER_ACCESS_STORAGE_FAILED';
    throw error;
  }
};

export const getCheckoutSubmissionErrorMessage = (error, lines = []) => {
  if (error?.code === 'ACTIVE_ORDER_ACCESS_STORAGE_FAILED') {
    return 'Не удалось сохранить доступ к заказу. Оформление остановлено. Разрешите хранение данных в браузере и повторите.';
  }
  if (error?.code === 'MINIMUM_ORDER') {
    return 'Минимальная сумма доставки — 300 ₽';
  }
  if (error?.code === 'ORDERING_PAUSED') {
    return getOrderingPausedMessage();
  }
  if (['PRODUCT_NOT_SALEABLE', 'PRODUCT_UNAVAILABLE'].includes(error?.code)) {
    const names = new Map(
      (Array.isArray(lines) ? lines : []).map((line) => [
        String(line?.productId || ''),
        String(line?.name || line?.productId || 'Товар'),
      ]),
    );
    const unavailable = (error?.details?.productIds ?? []).map((productId) => ({
      productId,
      name: names.get(String(productId)) || String(productId),
    }));
    return unavailable.length
      ? getUnavailableCheckoutMessage(unavailable)
      : 'Один из товаров временно недоступен';
  }
  if (error?.code === 'PRODUCT_OPTION_UNAVAILABLE') {
    return 'Один из выбранных вариантов временно недоступен. Вернитесь в корзину и выберите другой.';
  }
  return 'Не удалось оформить заказ. Проверьте интернет и повторите.';
};

export const isCheckoutOrderingPaused = (status = {}) =>
  status?.acceptingOrders === false;

export const getOrderingPausedMessage = () =>
  'Приём заказов временно приостановлен. Корзина сохранена.';

export const getCheckoutLineMeatId = (line = {}) => {
  const availableMeats = getAvailableMeats(String(line?.productId || ''));
  const savedMeat = String(line?.meat || '');
  const savedMeatId = availableMeats.includes(savedMeat)
    ? savedMeat
    : Object.entries(MEAT_LABELS).find(
        ([, label]) => String(label) === savedMeat,
      )?.[0];
  return availableMeats.includes(savedMeatId)
    ? savedMeatId
    : availableMeats[0] || '';
};

export const getUnavailableCheckoutProducts = (lines = [], status = {}) => {
  const stopped = new Set(
    Array.isArray(status?.stoppedProductIds)
      ? status.stoppedProductIds.map(String)
      : [],
  );
  const stoppedMeats = new Set(
    Array.isArray(status?.stoppedMeatIds)
      ? status.stoppedMeatIds.map(String)
      : [],
  );
  const stoppedSauces = new Set(
    Array.isArray(status?.stoppedSauceIds)
      ? status.stoppedSauceIds.map(String)
      : [],
  );
  const stoppedAddons = new Set(
    Array.isArray(status?.stoppedAddonIds)
      ? status.stoppedAddonIds.map(String)
      : [],
  );
  const sauceIdsByLabel = new Map(
    Object.entries(PRODUCT_SAUCES).map(([id, sauce]) => [
      String(sauce.label),
      id,
    ]),
  );
  const addonIdsByLabel = new Map(
    Object.entries(PRODUCT_ADDONS).map(([id, addon]) => [
      String(addon.label),
      id,
    ]),
  );
  const seen = new Set();
  return (Array.isArray(lines) ? lines : []).reduce((result, line) => {
    const productId = String(line?.productId || '');
    const meatId = getCheckoutLineMeatId(line);
    const hasStoppedMeat = meatId && meatId !== 'default'
      ? stoppedMeats.has(meatId)
      : !isProductAvailableForMeats(productId, stoppedMeats);
    const hasStoppedSauce = Object.entries(line?.sauces || {}).some(
      ([label, quantity]) =>
        Number(quantity) > 0 && stoppedSauces.has(sauceIdsByLabel.get(label)),
    );
    const hasStoppedAddon = Object.entries(line?.addons || {}).some(
      ([label, quantity]) =>
        Number(quantity) > 0 && stoppedAddons.has(addonIdsByLabel.get(label)),
    );
    const unavailable =
      stopped.has(productId) ||
      hasStoppedMeat ||
      hasStoppedSauce ||
      hasStoppedAddon;
    if (!unavailable || seen.has(productId)) return result;
    seen.add(productId);
    result.push({
      productId,
      name: String(line?.name || productId || 'Товар'),
    });
    return result;
  }, []);
};

export const getUnavailableCheckoutMessage = (products = []) =>
  products.length
    ? `Сейчас нет в наличии: ${products.map(({ name }) => name).join(', ')}. Удалите товар или выберите другой.`
    : '';

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

export const clearLegacyDeliveryAddress = (storage) => {
  try {
    storage?.removeItem?.(DELIVERY_ADDRESS_STORAGE_KEY);
  } catch {
    // The current checkout still works when browser storage is unavailable.
  }
  return normalizeDeliveryAddress();
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
  const personalDataConsentInput = document.querySelector(
    '[data-personal-data-consent]',
  );
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
  let deliveryAddress = clearLegacyDeliveryAddress(window.localStorage);
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
    personalDataConsent: personalDataConsentInput.checked,
  });

  const getControl = (name) => {
    const controls = {
      phone: phoneInput,
      address: addressInput,
      selectedTime: timeSelect,
      personalDataConsent: personalDataConsentInput,
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
      deliveryAddress = readDeliveryAddress();
      renderAddressSummary();
      if (input === addressStreet) setFieldError('address');
    });
  });

  [
    ['phone', phoneInput],
    ['address', addressInput],
    ['selectedTime', timeSelect],
    ['personalDataConsent', personalDataConsentInput],
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

    ['address', 'phone', 'selectedTime', 'personalDataConsent'].forEach(
      (name) => setFieldError(name, errors[name] || ''),
    );
    const validationAction = getCheckoutValidationAction(errors, order);
    if (validationAction.toast) showToast(validationAction.toast);
    if (validationAction.focusField) {
      if (validationAction.focusField === 'address') {
        setAddressExpanded(true);
      }
      const control = getControl(validationAction.focusField);
      control.focus();
      control.closest('[data-field]')?.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
          .matches
          ? 'auto'
          : 'smooth',
        block: 'center',
      });
      return;
    }
    if (errors.order) return;

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
      personalDataConsent: personalDataConsentInput.checked,
    });
    try {
      const catalogStatus = await clientApi.getCatalogStatus();
      if (isCheckoutOrderingPaused(catalogStatus)) {
        confirmButton.classList.remove('is-loading');
        confirmButton.disabled = false;
        showToast(getOrderingPausedMessage());
        return;
      }
      const unavailable = getUnavailableCheckoutProducts(lines, catalogStatus);
      if (unavailable.length > 0) {
        confirmButton.classList.remove('is-loading');
        confirmButton.disabled = false;
        showToast(getUnavailableCheckoutMessage(unavailable));
        return;
      }
      const attemptKey = await getCheckoutAttemptKey(
        window.sessionStorage,
        payload,
      );
      const order = await clientApi.createOrder(payload, attemptKey);
      saveCreatedOrderAccess(window.localStorage, order);
      saveCart(window.localStorage, []);
      clearCheckoutAttempt(window.sessionStorage);
      window.location.href =
        order.payment?.confirmationUrl || 'order.html';
    } catch (error) {
      confirmButton.classList.remove('is-loading');
      confirmButton.disabled = false;
      showToast(getCheckoutSubmissionErrorMessage(error, lines));
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
