import { createKioskSessionController } from './kiosk-session.js';

const root = document.querySelector('[data-kiosk-app]');
let warning = null;
const hideWarning = () => { warning?.remove(); warning = null; };
const showWarning = () => {
  hideWarning();
  warning = document.createElement('aside');
  warning.className = 'kiosk-session-warning';
  warning.innerHTML = '<strong>Продолжить заказ?</strong><span>Коснитесь экрана — иначе корзина очистится через 10 секунд</span>';
  document.body.append(warning);
};
const reset = () => window.location.reload();
const controller = createKioskSessionController({ onWarn: showWarning, onReset: reset });
const getScreenState = () => ({
  screen: root.querySelector('.kiosk-start') ? 'start' : root.querySelector('.kiosk-payment-result.is-success') ? 'success' : root.firstElementChild ? 'active' : '',
  lines: root.querySelector('.kiosk-cart-bar.has-items, .kiosk-cart-line') ? [{}] : [],
});
const sync = () => controller.sync(getScreenState());
new MutationObserver(sync).observe(root, { childList: true, subtree: true });
const markActivity = () => { hideWarning(); controller.activity(getScreenState()); };
['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel', 'scroll', 'keydown'].forEach((name) => {
  document.addEventListener(name, markActivity, { passive: true, capture: name === 'scroll' });
});
sync();

const KIOSK_BUILD = '20260823-8';
const SW_RELOAD_KEY = 'kiosk-sw-reloaded';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sessionStorage.getItem(SW_RELOAD_KEY) === KIOSK_BUILD) return;
    sessionStorage.setItem(SW_RELOAD_KEY, KIOSK_BUILD);
    window.location.reload();
  });

  navigator.serviceWorker
    .register(`./kiosk-sw.js?v=${KIOSK_BUILD}`, { updateViaCache: 'none' })
    .then((registration) => registration.update())
    .catch(() => {});
}
