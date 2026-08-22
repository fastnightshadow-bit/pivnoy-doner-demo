import {
  createKioskState,
  reduceKioskState,
} from './kiosk-state.js';
import {
  createDemoKioskApi,
  createKioskApi,
  isKioskDemoLocation,
} from './kiosk-api.js';
import { renderKiosk } from './kiosk-presentation.js';

const root = document.querySelector('[data-kiosk-app]');
const api = isKioskDemoLocation(window.location)
  ? createDemoKioskApi()
  : createKioskApi();

let state = createKioskState();
let context = {
  products: [],
  settings: {
    acceptingOrders: true,
    stoppedProductIds: [],
    stoppedMeatIds: [],
    stoppedSauceIds: [],
    stoppedAddonIds: [],
  },
  connected: true,
};

const render = () => {
  root.innerHTML = renderKiosk(state, context);
};

const dispatch = (event) => {
  const next = reduceKioskState(state, event);
  if (next === state) return;
  state = next;
  render();
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

  if (event.target.closest('[data-kiosk-back]')) {
    dispatch({ type: 'BACK' });
  }
});

const start = async () => {
  try {
    const bootstrap = await api.getBootstrap();
    context = { ...context, ...bootstrap };
    render();
    api.subscribe(
      (message) => {
        if (message.type !== 'settings.updated') return;
        context = { ...context, settings: message.settings };
        render();
      },
      (connected) => {
        context = { ...context, connected };
        render();
      },
    );
  } catch (error) {
    root.innerHTML = `
      <section class="kiosk-fatal" role="alert">
        <img src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" />
        <h1>Не удалось загрузить меню</h1>
        <p>${String(error?.message || 'Проверьте подключение к интернету')}</p>
        <button class="kiosk-primary kiosk-touch" type="button" onclick="location.reload()">Повторить</button>
      </section>`;
  }
};

start();
