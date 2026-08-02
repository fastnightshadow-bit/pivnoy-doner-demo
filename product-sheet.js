import { PRODUCTS } from './catalog-data.js';
import {
  addCartLine,
  changeCartLineQuantity,
  createCartLine,
} from './cart-state.js';
import { loadCart, saveCart } from './cart-storage.js';
import {
  calculateProductPrice,
  getAvailableMeats,
  getAvailableSizes,
  getProductConfiguration,
  getProductDescription,
  getSizeLabelWithWeight,
  MEAT_LABELS,
  PRODUCT_ADDONS,
  SIZE_LABELS,
  SIZE_WEIGHT_LABELS,
} from './product-config.js';
import { pulseMotion } from './motion.js';

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatPrice = (price) =>
  `${Math.max(0, Number(price) || 0).toLocaleString('ru-RU')}&nbsp;₽`;

export const shouldDismissProductSheet = ({
  distance = 0,
  height = 1,
  velocity = 0,
} = {}) =>
  distance > 0 &&
  (distance / Math.max(1, height) >= 0.28 || velocity >= 0.7);

const normalizeSelection = (productId, selection = {}) => {
  const meats = getAvailableMeats(productId);
  const meat = meats.includes(selection.meat) ? selection.meat : meats[0];
  const sizes = getAvailableSizes(productId, meat);
  const size = sizes.includes(selection.size) ? selection.size : sizes[0];
  const allowedAddons = new Set(
    getProductConfiguration(productId)?.addons ?? [],
  );

  return {
    meat,
    size,
    addons: [
      ...new Set(
        (Array.isArray(selection.addons) ? selection.addons : []).filter(
          (addon) => allowedAddons.has(addon),
        ),
      ),
    ],
    comment: String(selection.comment ?? ''),
  };
};

const createMediaMarkup = (product) => {
  if (product.image) {
    return `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />`;
  }

  return `
    <span class="product-sheet__placeholder" aria-hidden="true">
      <svg class="icon"><use href="#home-i-${escapeHtml(product.icon)}"></use></svg>
    </span>`;
};

const createMeatMarkup = (productId, selection) => {
  const meats = getAvailableMeats(productId);
  if (meats.length < 2) return '';

  return `
    <section class="product-sheet__section" aria-labelledby="sheet-meat-title">
      <h3 id="sheet-meat-title">Мясо</h3>
      <div class="product-sheet__segments" role="group" aria-label="Выбор мяса">
        ${meats
          .map(
            (meat) => `
              <button
                class="${meat === selection.meat ? 'is-active' : ''}"
                type="button"
                aria-pressed="${meat === selection.meat}"
                data-sheet-meat="${meat}"
              >${MEAT_LABELS[meat]}</button>`,
          )
          .join('')}
      </div>
    </section>`;
};

const createSizeMarkup = (productId, selection) => {
  const sizes = getAvailableSizes(productId, selection.meat);
  if (sizes.length < 2) return '';

  return `
    <section class="product-sheet__section" aria-labelledby="sheet-size-title">
      <h3 id="sheet-size-title">Размер</h3>
      <div class="product-sheet__sizes" role="group" aria-label="Выбор размера">
        ${sizes
          .map((size) => {
            const price = calculateProductPrice(productId, {
              ...selection,
              size,
              addons: [],
            });
            return `
              <button
                class="${size === selection.size ? 'is-active' : ''}"
                type="button"
                aria-pressed="${size === selection.size}"
                data-sheet-size="${size}"
              >
                <span>${SIZE_LABELS[size]}</span>
                <small>${SIZE_WEIGHT_LABELS[size]} · ${formatPrice(price)}</small>
              </button>`;
          })
          .join('')}
      </div>
    </section>`;
};

const createAddonMarkup = (productId, selection) => {
  const addonIds = getProductConfiguration(productId)?.addons ?? [];
  if (addonIds.length === 0) return '';

  return `
    <section class="product-sheet__section" aria-labelledby="sheet-addon-title">
      <h3 id="sheet-addon-title">Добавки</h3>
      <div class="product-sheet__addons">
        ${addonIds
          .map((addonId) => {
            const addon = PRODUCT_ADDONS[addonId];
            const active = selection.addons.includes(addonId);
            return `
              <button
                class="${active ? 'is-active' : ''}"
                type="button"
                role="checkbox"
                aria-checked="${active}"
                data-sheet-addon="${addonId}"
              >
                <span>${addon.label}</span>
                <small>+${formatPrice(addon.price)}</small>
              </button>`;
          })
          .join('')}
      </div>
    </section>`;
};

const createPurchaseMarkup = (totalPrice, quantity) => {
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const control =
    safeQuantity > 0
      ? `
        <div class="product-sheet__quantity" data-sheet-quantity>
          <button type="button" aria-label="Уменьшить количество" data-sheet-quantity-change="-1">
            <svg class="icon"><use href="#home-i-minus"></use></svg>
          </button>
          <output aria-live="polite">${safeQuantity}</output>
          <button type="button" aria-label="Увеличить количество" data-sheet-quantity-change="1">
            <svg class="icon"><use href="#home-i-plus"></use></svg>
          </button>
        </div>`
      : `
        <button class="product-sheet__add" type="button" data-sheet-add>
          <span>Добавить в корзину</span>
        </button>`;

  return `
    <footer class="product-sheet__purchase" data-sheet-purchase>
      <div class="product-sheet__total">
        <span>Итого</span>
        <strong data-sheet-total>${formatPrice(totalPrice)}</strong>
      </div>
      ${control}
    </footer>`;
};

export const createProductSheetMarkup = (
  product,
  rawSelection = {},
  quantity = 0,
  { lockMeat = false } = {},
) => {
  if (!product?.id) return '';
  const selection = normalizeSelection(product.id, rawSelection);
  const totalPrice =
    calculateProductPrice(product.id, selection) *
    Math.max(1, Number(quantity) || 1);
  const description = getProductDescription(product, selection.meat);

  return `
    <div class="product-sheet__handle-zone" data-sheet-handle>
      <span class="product-sheet__handle" aria-hidden="true"></span>
    </div>
    <div class="product-sheet__scroll" data-sheet-scroll>
      <div class="product-sheet__media">
        ${createMediaMarkup(product)}
        ${
          product.badge
            ? `<span class="product-sheet__badge">${escapeHtml(product.badge)}</span>`
            : ''
        }
        <button class="product-sheet__close" type="button" aria-label="Закрыть карточку" data-sheet-close>
          <svg class="icon" aria-hidden="true">
            <use href="#product-sheet-i-close"></use>
          </svg>
        </button>
      </div>

      <div class="product-sheet__content">
        <header class="product-sheet__header">
          <h2>${escapeHtml(product.name)}</h2>
          <p data-sheet-description>${escapeHtml(description)}</p>
        </header>

        ${lockMeat ? '' : createMeatMarkup(product.id, selection)}
        ${createSizeMarkup(product.id, selection)}
        ${createAddonMarkup(product.id, selection)}

        <section class="product-sheet__section product-sheet__comment">
          <label for="sheet-comment">Комментарий к заказу</label>
          <textarea
            id="sheet-comment"
            rows="2"
            maxlength="160"
            placeholder="Например, без лука"
            data-sheet-comment
          >${escapeHtml(selection.comment)}</textarea>
        </section>
      </div>
    </div>
    ${createPurchaseMarkup(totalPrice, quantity)}`;
};

const createSelectionCartLine = (product, selection) =>
  createCartLine({
    productId: product.id,
    name: product.name,
    unitPrice: calculateProductPrice(product.id, selection),
    meat: MEAT_LABELS[selection.meat] ?? '',
    size: getSizeLabelWithWeight(selection.size),
    addons: selection.addons.map(
      (addon) => PRODUCT_ADDONS[addon]?.label ?? addon,
    ),
    comment: selection.comment,
    image: product.image,
    icon: product.icon,
  });

export const initProductSheet = ({
  dialog,
  storage = globalThis.localStorage,
  onCartChange = () => {},
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  historyRef = globalThis.history,
  matchMediaRef = globalThis.matchMedia,
} = {}) => {
  if (!dialog) {
    return {
      open: () => false,
      close: () => {},
      isOpen: () => false,
      destroy: () => {},
    };
  }

  const surface = dialog.querySelector('[data-sheet-surface]');
  const desktopMedia = windowRef?.matchMedia?.('(min-width: 1024px)');
  const reducedMotion = Boolean(
    matchMediaRef?.('(prefers-reduced-motion: reduce)')?.matches,
  );
  const state = {
    product: null,
    selection: null,
    quantity: 0,
    lineId: '',
    opener: null,
    lockMeat: false,
    favorite: false,
    ownsHistory: false,
    closeTimer: 0,
    settleTimer: 0,
    gesture: {
      dragging: false,
      pointerId: null,
      startY: 0,
      lastY: 0,
      startedAt: 0,
      distance: 0,
    },
  };
  const isOpen = () =>
    Boolean(dialog.open || dialog.hasAttribute?.('open'));

  const getCurrentLine = () =>
    state.product && state.selection
      ? createSelectionCartLine(state.product, state.selection)
      : null;

  const syncQuantity = (lines = loadCart(storage)) => {
    const currentLine = getCurrentLine();
    const storedLine = currentLine
      ? lines.find(({ lineId }) => lineId === currentLine.lineId)
      : null;
    state.lineId = storedLine?.lineId ?? '';
    state.quantity = storedLine?.quantity ?? 0;
    return lines;
  };

  const render = ({ keepScroll = false, animatePrice = false } = {}) => {
    if (!surface || !state.product) return;
    const previousScroll = keepScroll
      ? surface.querySelector('[data-sheet-scroll]')?.scrollTop ?? 0
      : 0;
    surface.innerHTML = createProductSheetMarkup(
      state.product,
      state.selection,
      state.quantity,
      { lockMeat: state.lockMeat },
    );
    const scroll = surface.querySelector('[data-sheet-scroll]');
    if (scroll) scroll.scrollTop = previousScroll;
    if (animatePrice) {
      pulseMotion(surface.querySelector('[data-sheet-total]'));
    }
  };

  const finishClose = () => {
    if (!isOpen() || dialog.classList.contains('is-closing')) return;
    dialog.classList.remove('is-dragging', 'is-settling');
    dialog.classList.add('is-closing');
    globalThis.clearTimeout(state.closeTimer);
    state.closeTimer = globalThis.setTimeout(
      () => {
        dialog.classList.remove('is-closing');
        surface?.style.removeProperty('--sheet-drag-y');
        if (typeof dialog.close === 'function') dialog.close();
        else {
          dialog.removeAttribute('open');
          onClose();
        }
      },
      reducedMotion ? 0 : 260,
    );
  };

  const close = (reason = 'control') => {
    if (!isOpen()) return;
    const ownsActiveHistory =
      state.ownsHistory &&
      historyRef?.state?.productSheet === state.product?.id;
    if (
      reason !== 'popstate' &&
      ownsActiveHistory &&
      typeof historyRef?.back === 'function'
    ) {
      historyRef.back();
      return;
    }
    state.ownsHistory = false;
    finishClose();
  };

  const persistLines = (lines, line = null) => {
    saveCart(storage, lines);
    syncQuantity(lines);
    onCartChange(
      lines,
      line
        ? {
            productId: state.product.id,
            lineId: line.lineId,
          }
        : undefined,
    );
    render({ keepScroll: true, animatePrice: true });
  };

  const updateSelection = (change) => {
    const comment =
      surface?.querySelector('[data-sheet-comment]')?.value ??
      state.selection.comment;
    state.selection = normalizeSelection(state.product.id, {
      ...state.selection,
      ...change,
      comment,
    });
    syncQuantity();
    render({ keepScroll: true, animatePrice: true });
  };

  const onClick = (event) => {
    const closeButton = event.target.closest('[data-sheet-close]');
    if (closeButton) {
      close();
      return;
    }

    const meatButton = event.target.closest('[data-sheet-meat]');
    if (meatButton && !state.lockMeat) {
      updateSelection({ meat: meatButton.dataset.sheetMeat, size: undefined });
      return;
    }

    const sizeButton = event.target.closest('[data-sheet-size]');
    if (sizeButton) {
      updateSelection({ size: sizeButton.dataset.sheetSize });
      return;
    }

    const addonButton = event.target.closest('[data-sheet-addon]');
    if (addonButton) {
      const addon = addonButton.dataset.sheetAddon;
      const addons = new Set(state.selection.addons);
      if (addons.has(addon)) addons.delete(addon);
      else addons.add(addon);
      updateSelection({ addons: [...addons] });
      return;
    }

    if (event.target.closest('[data-sheet-add]')) {
      const comment =
        surface?.querySelector('[data-sheet-comment]')?.value ?? '';
      state.selection = { ...state.selection, comment };
      const line = createSelectionCartLine(state.product, state.selection);
      persistLines(addCartLine(loadCart(storage), line), line);
      return;
    }

    const quantityButton = event.target.closest('[data-sheet-quantity-change]');
    if (quantityButton && state.lineId) {
      const line = getCurrentLine();
      persistLines(
        changeCartLineQuantity(
          loadCart(storage),
          state.lineId,
          Number(quantityButton.dataset.sheetQuantityChange),
        ),
        line,
      );
      return;
    }

    if (event.target === dialog) close();
  };

  const onCancel = (event) => {
    event.preventDefault();
    close();
  };

  const onClose = () => {
    globalThis.clearTimeout(state.closeTimer);
    globalThis.clearTimeout(state.settleTimer);
    state.ownsHistory = false;
    state.gesture.dragging = false;
    dialog.classList.remove('is-dragging', 'is-settling', 'is-closing');
    surface?.style.removeProperty('--sheet-drag-y');
    documentRef?.documentElement.classList.remove('sheet-open');
    const fallbackOpener = state.product
      ? documentRef?.querySelector(
          `[data-open-product="${state.product.id}"]`,
        )
      : null;
    const opener = state.opener?.isConnected ? state.opener : fallbackOpener;
    opener?.focus?.({ preventScroll: true });
  };

  const onPointerDown = (event) => {
    if (desktopMedia?.matches) return;
    const handle = event.target.closest?.('[data-sheet-handle]');
    if (!handle || event.button > 0 || !surface || !isOpen()) return;
    state.gesture = {
      dragging: true,
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startedAt: performance.now(),
      distance: 0,
    };
    globalThis.clearTimeout(state.settleTimer);
    dialog.classList.remove('is-settling');
    dialog.classList.add('is-dragging');
    surface.style.setProperty('--sheet-drag-y', '0px');
    handle.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (
      !state.gesture.dragging ||
      event.pointerId !== state.gesture.pointerId ||
      !surface
    ) {
      return;
    }
    const distance = Math.max(0, event.clientY - state.gesture.startY);
    state.gesture.lastY = event.clientY;
    state.gesture.distance = distance;
    surface.style.setProperty('--sheet-drag-y', `${distance}px`);
    event.preventDefault();
  };

  const settleGesture = () => {
    dialog.classList.remove('is-dragging');
    dialog.classList.add('is-settling');
    surface?.style.setProperty('--sheet-drag-y', '0px');
    globalThis.clearTimeout(state.settleTimer);
    state.settleTimer = globalThis.setTimeout(
      () => {
        dialog.classList.remove('is-settling');
        surface?.style.removeProperty('--sheet-drag-y');
      },
      reducedMotion ? 0 : 180,
    );
  };

  const onPointerEnd = (event) => {
    if (
      !state.gesture.dragging ||
      event.pointerId !== state.gesture.pointerId
    ) {
      return;
    }
    const handle = event.target.closest?.('[data-sheet-handle]');
    handle?.releasePointerCapture?.(event.pointerId);
    const elapsed = Math.max(1, performance.now() - state.gesture.startedAt);
    const distance = state.gesture.distance;
    const velocity = distance / elapsed;
    const height = surface?.offsetHeight || 1;
    state.gesture.dragging = false;

    if (shouldDismissProductSheet({ distance, height, velocity })) {
      dialog.classList.remove('is-dragging');
      close('gesture');
    } else {
      settleGesture();
    }
  };

  const openProduct = (
    productId,
    opener = null,
    {
      pushHistory = true,
      selection = {},
      lockMeat = false,
    } = {},
  ) => {
    const product = PRODUCTS.find(({ id }) => id === productId);
    if (!product || !surface) return false;
    const meat = getAvailableMeats(product.id).includes(selection.meat)
      ? selection.meat
      : getAvailableMeats(product.id)[0];
    const size = getAvailableSizes(product.id, meat).includes(selection.size)
      ? selection.size
      : getAvailableSizes(product.id, meat)[0];
    state.product = product;
    state.selection = normalizeSelection(product.id, {
      meat,
      size,
      addons: selection.addons ?? [],
      comment: selection.comment ?? '',
    });
    state.lockMeat = Boolean(lockMeat);
    state.opener = opener;
    syncQuantity();
    render();
    dialog.classList.remove('is-closing', 'is-dragging', 'is-settling');
    documentRef?.documentElement.classList.add('sheet-open');
    if (!isOpen()) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (pushHistory && typeof historyRef?.pushState === 'function') {
      historyRef.pushState(
        {
          ...(historyRef.state ?? {}),
          productSheet: productId,
          productSelection: { meat: state.selection.meat },
          productLockMeat: state.lockMeat,
        },
        '',
        `#product-${productId}`,
      );
    }
    state.ownsHistory = true;
    surface
      .querySelector('[data-sheet-close]')
      ?.focus({ preventScroll: true });
    return true;
  };

  const onPopState = (event) => {
    const productId = event.state?.productSheet;
    if (productId) {
      openProduct(productId, null, {
        pushHistory: false,
        selection: event.state?.productSelection ?? {},
        lockMeat: Boolean(event.state?.productLockMeat),
      });
      return;
    }
    if (isOpen()) close('popstate');
  };

  dialog.addEventListener('click', onClick);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('close', onClose);
  dialog.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('pointermove', onPointerMove);
  dialog.addEventListener('pointerup', onPointerEnd);
  dialog.addEventListener('pointercancel', onPointerEnd);
  windowRef?.addEventListener('popstate', onPopState);

  return {
    open: openProduct,
    close,
    isOpen,
    destroy() {
      globalThis.clearTimeout(state.closeTimer);
      globalThis.clearTimeout(state.settleTimer);
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointermove', onPointerMove);
      dialog.removeEventListener('pointerup', onPointerEnd);
      dialog.removeEventListener('pointercancel', onPointerEnd);
      windowRef?.removeEventListener('popstate', onPopState);
    },
  };
};
