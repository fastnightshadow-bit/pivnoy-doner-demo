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
['pointerdown', 'touchstart', 'keydown'].forEach((name) => document.addEventListener(name, () => { hideWarning(); controller.activity(getScreenState()); }, { passive: true }));
sync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./kiosk-sw.js').catch(() => {});
