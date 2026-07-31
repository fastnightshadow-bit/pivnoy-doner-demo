import {
  createCategoryTabs,
  createMenuProductCard,
  createProductQuantityControl,
  getMenuProducts,
} from './home-menu.js';
import {
  changeCartLineQuantity,
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
import { getOrderPresentation } from './order-state.js';
import {
  loadActiveOrder,
  subscribeToActiveOrder,
} from './order-storage.js';
import {
  loadPreferredProductLines,
  resolvePreferredProductLine,
  savePreferredProductLine,
} from './product-preference-storage.js';
import { initProductSheet } from './product-sheet.js';

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

function initHomeScreen() {
  const header = document.querySelector('.app-header');
  const hero = document.querySelector('#home-hero');
  const tabbar = document.querySelector('[data-hero-aware-nav]');
  const categoriesSection = document.querySelector('#categories');
  const categoriesRoot = document.querySelector('[data-home-categories]');
  const menuRoot = document.querySelector('[data-home-menu]');
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
  const savedFulfillment = loadFulfillment(window.localStorage);

  const storedLines = loadInitialHomeCart(window.localStorage);
  let preferredLines = loadPreferredProductLines(window.localStorage);

  const state = {
    category: 'shawarma',
    lines: storedLines,
    quantities: {},
  };
  let toastTimer;
  let hasRenderedHome = false;

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

  renderActiveOrder(loadActiveOrder(window.localStorage));
  const unsubscribeActiveOrder = subscribeToActiveOrder(
    window,
    renderActiveOrder,
  );
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
    );
  };

  const updateProductControls = (productId) => {
    syncQuantities();
    const product = PRODUCTS.find(({ id }) => id === productId);
    if (!product) return;
    const quantity = state.quantities[productId] || 0;

    document
      .querySelectorAll(`[data-product-control="${productId}"]`)
      .forEach((control) => {
        const namespace = control.dataset.controlNamespace || 'menu';
        const template = document.createElement('template');
        template.innerHTML = createProductQuantityControl(
          product,
          quantity,
          namespace,
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
    if (menuRoot) {
      menuRoot.innerHTML = getMenuProducts(state.category)
        .map((product) =>
          createMenuProductCard(product, state.quantities[product.id] || 0),
        )
        .join('');
      if (!hasRenderedHome) staggerMotion(menuRoot, '.menu-product');
      if (animateMenu) revealMotion(menuRoot);
    }
    renderFeaturedControl();
    updateCart(animateCart);
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
  });

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
    const quantity = state.quantities[productId] || 0;
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

    const productTrigger = event.target.closest('[data-open-product]');
    if (productTrigger) {
      productSheet.open(productTrigger.dataset.openProduct, productTrigger);
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
      const preferred = getPreferredLine(id);
      if (!preferred) {
        productSheet.open(id, requestButton);
        return;
      }
      updatePreferredQuantity(preferred, 1);
      pulseMotion(requestButton);
      return;
    }

    const changeButton = event.target.closest('[data-quantity-change]');
    if (changeButton) {
      const id =
        changeButton.dataset.productId ||
        changeButton.closest('[data-quantity]')?.dataset.quantity;
      if (!id) return;
      const preferred = getPreferredLine(id);
      if (!preferred) {
        if (Number(changeButton.dataset.quantityChange) > 0) {
          productSheet.open(id, changeButton);
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
