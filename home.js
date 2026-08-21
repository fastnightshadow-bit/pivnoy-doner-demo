import {
  createCategoryTabs,
  createDesktopCategoryLinks,
  createEmptyCategoryState,
  createMeatSubgroupSwitch,
  createMenuProductCard,
  createProductQuantityControl,
  getMenuCategory,
  getMenuProducts,
  normalizeMenuMeat,
  resolveMenuProductLine,
} from './home-menu.js?v=2026081702';
import {
  addCartLine,
  changeCartLineQuantity,
  createCartLine,
} from './cart-state.js';
import { loadCart, saveCart } from './cart-storage.js';
import { PRODUCTS } from './catalog-data.js';
import { getCatalogCartCount } from './catalog-state.js';
import {
  loadFulfillment,
  saveFulfillment,
} from './fulfillment-storage.js';
import {
  pulseMotion,
  revealMotion,
  staggerMotion,
} from './motion.js';
import { getOrderPresentation } from './order-state.js?v=2026081404';
import {
  loadActiveOrder,
  loadActiveOrderAccess,
  subscribeToActiveOrder,
} from './order-storage.js?v=2026081402';
import {
  loadPreferredProductLines,
  resolvePreferredProductLine,
  savePreferredProductLine,
} from './product-preference-storage.js';
import { initProductSheet } from './product-sheet.js?v=2026082101';
import { createReviewService } from './review-service.js?v=2026081402';
import { createReviewsSectionMarkup } from './review-view.js?v=2026081402';
import { clientApi } from './client-api.js?v=2026081402';
import { useProductionApi } from './runtime-mode.js';

export function selectCategory(labels, activeIndex) {
  return labels.map((label, index) => ({ label, active: index === activeIndex }));
}

export function changeQuantity(quantity, delta) {
  return Math.max(0, Number(quantity) + Number(delta));
}

export function getCartTotal(quantities) {
  return quantities.reduce((sum, quantity) => sum + Number(quantity || 0), 0);
}

export function loadInitialHomeCart(storage) {
  return loadCart(storage);
}

export function getActiveHomeTab(scrollY, categoriesTop, stickyHeaderHeight = 0) {
  const currentScroll = Math.max(0, Number(scrollY) || 0);
  const stickyOffset = Math.max(0, Number(stickyHeaderHeight) || 0);
  const menuStart = Math.max(0, Number(categoriesTop) || 0) - stickyOffset - 24;
  return currentScroll >= menuStart ? 'menu' : 'home';
}

export const getHomeActiveOrderAccess = (storage) =>
  loadActiveOrderAccess(storage);

function initHomeScreen() {
  const header = document.querySelector('.app-header');
  const hero = document.querySelector('#home-hero');
  const tabbar = document.querySelector('[data-hero-aware-nav]');
  const categoriesSection = document.querySelector('#categories');
  const categoriesRoot = document.querySelector('[data-home-categories]');
  const menuRoot = document.querySelector('[data-home-menu]');
  const menuTitleRoot = document.querySelector('[data-home-menu-title]');
  const meatSwitchRoot = document.querySelector('[data-home-meat-switch]');
  const desktopNavRoot = document.querySelector('[data-home-desktop-nav]');
  const productSheetDialog = document.querySelector('[data-product-sheet]');
  const navigationTabs = [...document.querySelectorAll('[data-tab]')];
  const featuredControlRoot = document.querySelector(
    '[data-featured-control="classic-shawarma"]',
  );
  const fulfillmentButtons = [
    ...document.querySelectorAll('.fulfillment-switch button'),
  ];
  const cartCounts = [...document.querySelectorAll('[data-cart-count]')];
  const toast = document.querySelector('[data-toast]');
  const activeOrder = document.querySelector('[data-active-order]');
  const activeOrderStatus = document.querySelector(
    '[data-active-order-status]',
  );
  const activeOrderMeta = document.querySelector(
    '[data-active-order-meta]',
  );
  const reviewsRoot = document.querySelector('[data-home-reviews]');
  const orderingStatus = document.querySelector('[data-ordering-status]');
  const savedFulfillment = loadFulfillment(window.localStorage);
  const productionApi = useProductionApi();

  const storedLines = loadInitialHomeCart(window.localStorage);
  let preferredLines = loadPreferredProductLines(window.localStorage);

  const state = {
    category: 'shawarma',
    meatByCategory: {
      shawarma: 'chicken',
      doner: 'chicken',
    },
    lines: storedLines,
    quantities: {},
    acceptingOrders: true,
    stoppedProductIds: new Set(),
    stoppedMeatIds: new Set(),
    stoppedSauceIds: new Set(),
    stoppedAddonIds: new Set(),
  };
  let toastTimer;
  let hasRenderedHome = false;
  const isMeatAvailable = (meatId) =>
    !state.stoppedMeatIds.has(String(meatId));
  const isSauceAvailable = (sauceId) =>
    !state.stoppedSauceIds.has(String(sauceId));
  const isAddonAvailable = (addonId) =>
    !state.stoppedAddonIds.has(String(addonId));
  const isProductAvailable = (productId) => {
    const id = String(productId);
    const sauceId = id.startsWith('sauce-') ? id.slice('sauce-'.length) : '';
    return (
      state.acceptingOrders &&
      !state.stoppedProductIds.has(id) &&
      (!sauceId || isSauceAvailable(sauceId))
    );
  };
  const getUnavailableLabel = (productId) =>
    state.stoppedProductIds.has(String(productId))
      ? 'Нет в наличии'
      : 'Приём заказов закрыт';

  const renderReviews = async () => {
    if (!reviewsRoot) return;
    const reviewService = createReviewService({
      storage: window.localStorage,
      api: productionApi ? clientApi : null,
    });
    try {
      reviewsRoot.innerHTML = createReviewsSectionMarkup(
        await reviewService.list(),
      );
      revealMotion(reviewsRoot);
    } catch {
      reviewsRoot.innerHTML = createReviewsSectionMarkup([]);
    }
  };

  const renderActiveOrder = (order) => {
    if (!activeOrder) return;
    activeOrder.hidden = !order;
    if (!order) return;

    const presentation = getOrderPresentation(order);
    activeOrderStatus.textContent = presentation.title;
    activeOrderMeta.textContent = `Заказ №${order.number}${
      presentation.eta ? ` · ${presentation.eta}` : ''
    }`;
  };

  const activeOrderAccess = productionApi
    ? getHomeActiveOrderAccess(window.localStorage)
    : null;

  if (productionApi) renderActiveOrder(null);
  else renderActiveOrder(loadActiveOrder(window.localStorage));

  const unsubscribeActiveOrder = productionApi
    ? activeOrderAccess
      ? clientApi.subscribeToOrder(
          activeOrderAccess.id,
          activeOrderAccess.token,
          {
            onUpdate: renderActiveOrder,
            onError: () => {},
          },
        )
      : () => {}
    : subscribeToActiveOrder(window, renderActiveOrder);
  window.addEventListener('pagehide', unsubscribeActiveOrder, {
    once: true,
  });

  const setActiveTab = (tabName) => {
    navigationTabs.forEach((item) => {
      const active = item.dataset.tab === tabName;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  };

  const getPreferredLine = (productId) =>
    resolvePreferredProductLine(
      state.lines,
      productId,
      preferredLines,
    );

  const getProductView = (productId, source = null) => {
    const product = PRODUCTS.find(({ id }) => id === productId);
    if (!product) return null;
    const selectedMeat = source?.dataset?.productMeat;
    if (!selectedMeat) return product;
    return {
      ...product,
      selectedMeat,
      lockMeat: source.dataset.lockMeat === 'true',
    };
  };

  const getProductViewLine = (product) =>
    resolveMenuProductLine(
      state.lines,
      product,
      getPreferredLine(product?.id),
    );

  const getProductSheetOptions = (product) =>
    product?.selectedMeat
      ? {
          selection: { meat: product.selectedMeat },
          lockMeat: Boolean(product.lockMeat),
        }
      : {};

  const syncQuantities = () => {
    state.quantities = Object.fromEntries(
      PRODUCTS.map((product) => [
        product.id,
        getPreferredLine(product.id)?.quantity ?? 0,
      ]),
    );
  };

  const updateCart = (animate = false) => {
    const total = getCatalogCartCount(
      state.lines.reduce((quantities, line) => {
        quantities[line.productId] =
          (quantities[line.productId] || 0) + line.quantity;
        return quantities;
      }, {}),
    );
    cartCounts.forEach((count) => {
      count.textContent = String(total);
      count.hidden = total === 0;
      if (animate && total > 0) pulseMotion(count);
    });
    const cartButton = document.querySelector('.cart-button');
    if (cartButton) {
      cartButton.setAttribute(
        'aria-label',
        total === 1 ? 'Корзина, 1 товар' : `Корзина, ${total} товаров`,
      );
    }
  };

  const renderFeaturedControl = () => {
    if (!featuredControlRoot) return;
    const product = PRODUCTS.find(({ id }) => id === 'classic-shawarma');
    if (!product) return;
    featuredControlRoot.innerHTML = createProductQuantityControl(
      product,
      state.quantities[product.id] || 0,
      'featured',
      {
        available: isProductAvailable(product.id),
        unavailableLabel: getUnavailableLabel(product.id),
      },
    );
  };

  const updateProductControls = (productId) => {
    syncQuantities();

    document
      .querySelectorAll(`[data-product-control="${productId}"]`)
      .forEach((control) => {
        const product = getProductView(productId, control);
        if (!product) return;
        const quantity = getProductViewLine(product)?.quantity ?? 0;
        const namespace = control.dataset.controlNamespace || 'menu';
        const template = document.createElement('template');
        template.innerHTML = createProductQuantityControl(
          product,
          quantity,
          namespace,
          {
            available: isProductAvailable(product.id),
            unavailableLabel: getUnavailableLabel(product.id),
          },
        ).trim();
        const replacement = template.content.firstElementChild;
        if (!replacement) return;
        const footer = control.closest('footer');
        control.replaceWith(replacement);
        footer?.classList.toggle('has-quantity', quantity > 0);
      });
  };

  const renderHomeMenu = ({
    animateMenu = false,
    animateCart = false,
  } = {}) => {
    syncQuantities();
    if (categoriesRoot) {
      categoriesRoot.innerHTML = createCategoryTabs(state.category);
    }
    if (desktopNavRoot) {
      desktopNavRoot.innerHTML = createDesktopCategoryLinks(state.category);
    }
    const category = getMenuCategory(state.category);
    const selectedMeat = state.meatByCategory[state.category];
    const meatMarkup = createMeatSubgroupSwitch(
      state.category,
      selectedMeat,
      { isMeatAvailable },
    );
    if (menuTitleRoot) menuTitleRoot.textContent = category?.label ?? '';
    if (meatSwitchRoot) {
      meatSwitchRoot.innerHTML = meatMarkup;
      meatSwitchRoot.hidden = !meatMarkup;
    }
    if (menuRoot) {
      const products = getMenuProducts(state.category, selectedMeat);
      menuRoot.classList.toggle('menu-list--text', state.category === 'sauces');
      menuRoot.innerHTML = category?.empty
        ? createEmptyCategoryState(category)
        : products
          .map((product) =>
            createMenuProductCard(
              product,
              getProductViewLine(product)?.quantity ?? 0,
              {
                available: isProductAvailable(product.id),
                unavailableLabel: getUnavailableLabel(product.id),
              },
            ),
          )
          .join('');
      if (!hasRenderedHome) staggerMotion(menuRoot, '.menu-product');
      if (animateMenu) revealMotion(menuRoot);
    }
    renderFeaturedControl();
    updateCart(animateCart);
    document
      .querySelectorAll('.desktop-nav [data-category]')
      .forEach((link) => {
        const active = link.dataset.category === state.category;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    hasRenderedHome = true;
  };

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(
      () => toast.classList.remove('is-visible'),
      1800,
    );
  };

  const renderStaticAvailability = () => {
    document.querySelectorAll('[data-product-card]').forEach((card) => {
      const productId = card.dataset.productCard;
      const available = isProductAvailable(productId);
      card.classList.toggle('is-unavailable', !available);
      card.querySelectorAll('button').forEach((button) => {
        if (button.matches('[data-open-product], [data-request-product], [data-quick-add]')) {
          button.disabled = !available;
          button.setAttribute('aria-disabled', String(!available));
        }
      });
      let badge = card.querySelector('[data-unavailable-badge]');
      if (!available && !badge) {
        badge = document.createElement('span');
        badge.className = 'product-unavailable-badge';
        badge.dataset.unavailableBadge = '';
        badge.textContent = getUnavailableLabel(productId);
        (card.querySelector('.product-card__media') || card).append(badge);
      }
      if (available) badge?.remove();
    });
  };

  const productSheet = initProductSheet({
    dialog: productSheetDialog,
    storage: window.localStorage,
    onCartChange(lines, context) {
      state.lines = lines;
      if (context?.productId && context?.lineId) {
        preferredLines = savePreferredProductLine(
          window.localStorage,
          context.productId,
          context.lineId,
        );
      }
      if (context?.productId) updateProductControls(context.productId);
      updateCart(true);
      showToast('Корзина обновлена');
    },
    isProductAvailable,
    isMeatAvailable,
    isSauceAvailable,
    isAddonAvailable,
    getUnavailableLabel,
  });

  const applyCatalogStatus = (status = {}) => {
    state.acceptingOrders = status.acceptingOrders !== false;
    state.stoppedProductIds = new Set(
      Array.isArray(status.stoppedProductIds)
        ? status.stoppedProductIds.map(String)
        : [],
    );
    state.stoppedMeatIds = new Set(
      Array.isArray(status.stoppedMeatIds)
        ? status.stoppedMeatIds.map(String)
        : [],
    );
    state.stoppedSauceIds = new Set(
      Array.isArray(status.stoppedSauceIds)
        ? status.stoppedSauceIds.map(String)
        : [],
    );
    state.stoppedAddonIds = new Set(
      Array.isArray(status.stoppedAddonIds)
        ? status.stoppedAddonIds.map(String)
        : [],
    );
    for (const categoryId of ['shawarma', 'doner']) {
      if (!isMeatAvailable(state.meatByCategory[categoryId])) {
        state.meatByCategory[categoryId] = isMeatAvailable('chicken')
          ? 'chicken'
          : 'beef';
      }
    }
    if (orderingStatus) orderingStatus.hidden = state.acceptingOrders;
    renderHomeMenu();
    renderStaticAvailability();
    productSheet.refreshAvailability();
  };

  const unsubscribeCatalogStatus = productionApi
    ? clientApi.subscribeToCatalogStatus({
        onUpdate: applyCatalogStatus,
        onError: () => {},
      })
    : () => {};
  window.addEventListener('pagehide', unsubscribeCatalogStatus, { once: true });

  const scrollToMenu = () => {
    document.querySelector('#categories')?.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
  };

  const updatePreferredQuantity = (preferred, delta) => {
    if (!preferred) return;
    const productId = preferred.productId;
    state.lines = changeCartLineQuantity(
      state.lines,
      preferred.lineId,
      delta,
    );
    saveCart(window.localStorage, state.lines);
    updateProductControls(productId);
    updateCart(true);
    const quantityOutput = document.querySelector(
      `[data-quantity="${productId}"] output`,
    );
    pulseMotion(quantityOutput);
    const quantity = state.lines.find(
      ({ lineId }) => lineId === preferred.lineId,
    )?.quantity ?? 0;
    showToast(quantity > 0 ? 'Корзина обновлена' : 'Удалено из корзины');
  };

  const syncFulfillmentButtons = (fulfillment) => {
    fulfillmentButtons.forEach((button) => {
      const active = button.dataset.fulfillment === fulfillment;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  syncFulfillmentButtons(savedFulfillment);

  fulfillmentButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const fulfillment = saveFulfillment(
        window.localStorage,
        button.dataset.fulfillment,
      );
      syncFulfillmentButtons(fulfillment);
    });
  });

  document.querySelector('[data-order-cta]')?.addEventListener('click', scrollToMenu);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-product-sheet]')) return;

    const meatButton = event.target.closest('[data-menu-meat]');
    if (meatButton) {
      state.meatByCategory[state.category] = normalizeMenuMeat(
        state.category,
        meatButton.dataset.menuMeat,
      );
      renderHomeMenu();
      return;
    }

    const productTrigger = event.target.closest('[data-open-product]');
    if (productTrigger) {
      const product = getProductView(
        productTrigger.dataset.openProduct,
        productTrigger,
      );
      if (!product || !isProductAvailable(product.id)) return;
      productSheet.open(
        product.id,
        productTrigger,
        getProductSheetOptions(product),
      );
      return;
    }

    const categoryButton = event.target.closest('[data-category]');
    if (categoryButton) {
      state.category = categoryButton.dataset.category;
      renderHomeMenu({ animateMenu: true });
      categoriesRoot
        ?.querySelector(`[data-category="${state.category}"]`)
        ?.scrollIntoView({
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      return;
    }

    const menuTab = event.target.closest('[data-tab="menu"]');
    if (menuTab) {
      event.preventDefault();
      scrollToMenu();
      return;
    }

    const requestButton = event.target.closest('[data-request-product]');
    if (requestButton) {
      const id = requestButton.dataset.requestProduct;
      const product = getProductView(id, requestButton);
      if (!product || !isProductAvailable(product.id)) return;
      const preferred = getProductViewLine(product);
      if (!preferred) {
        productSheet.open(
          id,
          requestButton,
          getProductSheetOptions(product),
        );
        return;
      }
      updatePreferredQuantity(preferred, 1);
      pulseMotion(requestButton);
      return;
    }

    const quickAddButton = event.target.closest('[data-quick-add]');
    if (quickAddButton) {
      const product = PRODUCTS.find(
        ({ id }) => id === quickAddButton.dataset.quickAdd,
      );
      if (!product?.quickAdd || !isProductAvailable(product.id)) return;
      const line = createCartLine({
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        image: null,
        icon: product.icon,
      });
      state.lines = addCartLine(state.lines, line);
      saveCart(window.localStorage, state.lines);
      preferredLines = savePreferredProductLine(
        window.localStorage,
        product.id,
        line.lineId,
      );
      updateProductControls(product.id);
      updateCart(true);
      pulseMotion(quickAddButton);
      showToast('Добавлено в корзину');
      return;
    }

    const changeButton = event.target.closest('[data-quantity-change]');
    if (changeButton) {
      const id =
        changeButton.dataset.productId ||
        changeButton.closest('[data-quantity]')?.dataset.quantity;
      if (!id) return;
      const control = changeButton.closest('[data-product-control]');
      const product = getProductView(id, control);
      if (!product || !isProductAvailable(product.id)) return;
      const preferred = getProductViewLine(product);
      if (!preferred) {
        if (Number(changeButton.dataset.quantityChange) > 0) {
          productSheet.open(
            id,
            changeButton,
            getProductSheetOptions(product),
          );
        }
        return;
      }
      updatePreferredQuantity(
        preferred,
        Number(changeButton.dataset.quantityChange),
      );
    }
  });

  navigationTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(tab.dataset.tab);
    });
  });

  const updateHeaderState = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 16);
    if (hero) {
      tabbar?.classList.toggle(
        'is-visible',
        window.scrollY >= hero.offsetHeight - 40,
      );
    }
    if (categoriesSection) {
      setActiveTab(
        getActiveHomeTab(
          window.scrollY,
          categoriesSection.offsetTop,
          header?.offsetHeight,
        ),
      );
    }
  };

  renderHomeMenu();
  renderStaticAvailability();
  void renderReviews();
  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomeScreen, { once: true });
  } else {
    initHomeScreen();
  }
}
