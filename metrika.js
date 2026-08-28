export const METRIKA_COUNTER_ID = 111695901;
export const CONSENT_STORAGE_KEY = 'pivdoner.analytics-consent.v1';

const GRANTED = 'granted';
const DENIED = 'denied';
const disableKey = `disableYaCounter${METRIKA_COUNTER_ID}`;
const tagUrl = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_COUNTER_ID}`;
const productionHosts = new Set(['pivdoner.ru', 'www.pivdoner.ru']);

export const isProductionHost = (locationRef) =>
  productionHosts.has(String(locationRef?.hostname || '').toLowerCase());

const readConsent = (storage) => {
  try {
    const value = storage?.getItem(CONSENT_STORAGE_KEY);
    return value === GRANTED || value === DENIED ? value : null;
  } catch {
    return null;
  }
};

const saveConsent = (storage, value) => {
  try {
    storage?.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // The decision still applies to the current page when storage is unavailable.
  }
};

export const getSafeStorage = (windowRef) => {
  try {
    return windowRef.localStorage;
  } catch {
    return null;
  }
};

export const createAnalyticsController = ({ windowRef, documentRef, storage }) => {
  let started = false;
  let tagRequested = false;

  const setDisabled = (disabled) => {
    windowRef[disableKey] = disabled;
  };

  const ensureQueue = () => {
    if (typeof windowRef.ym === 'function') return;
    const queue = function (...args) {
      queue.a = queue.a || [];
      queue.a.push(args);
    };
    queue.l = Date.now();
    windowRef.ym = queue;
  };

  const start = () => {
    if (started) return;
    started = true;
    setDisabled(false);
    ensureQueue();
    windowRef.dataLayer = windowRef.dataLayer || [];
    windowRef.ym(METRIKA_COUNTER_ID, 'init', {
      ssr: true,
      webvisor: false,
      clickmap: false,
      ecommerce: 'dataLayer',
      accurateTrackBounce: true,
      trackLinks: true,
    });

    if (!tagRequested) {
      const tagElement = documentRef.createElement('script');
      tagElement.async = true;
      tagElement.src = tagUrl;
      tagElement.dataset.yandexMetrika = String(METRIKA_COUNTER_ID);
      documentRef.head.append(tagElement);
      tagRequested = true;
    }
  };

  return {
    initialize() {
      const consent = readConsent(storage);
      setDisabled(consent !== GRANTED);
      if (consent === GRANTED) start();
      return consent;
    },
    accept() {
      saveConsent(storage, GRANTED);
      start();
      return GRANTED;
    },
    decline() {
      saveConsent(storage, DENIED);
      setDisabled(true);
      if (started && typeof windowRef.ym === 'function') {
        windowRef.ym(METRIKA_COUNTER_ID, 'destruct');
      }
      started = false;
      return DENIED;
    },
  };
};

const createConsentBar = (documentRef) => {
  const bar = documentRef.createElement('section');
  bar.className = 'analytics-consent';
  bar.hidden = true;
  bar.setAttribute('aria-labelledby', 'analytics-consent-title');
  bar.setAttribute('aria-live', 'polite');
  bar.innerHTML = `
    <div class="analytics-consent__copy">
      <strong id="analytics-consent-title">Помогите улучшать сайт</strong>
      <p>Яндекс Метрика начнёт работу только с вашего согласия. Вебвизор отключён.</p>
    </div>
    <div class="analytics-consent__actions">
      <button class="analytics-consent__accept" type="button" data-analytics-accept>Принять</button>
      <button class="analytics-consent__decline" type="button" data-analytics-decline>Только необходимые</button>
      <a href="privacy.html#analytics">Подробнее</a>
    </div>
  `;
  documentRef.body.append(bar);
  return bar;
};

const boot = () => {
  const controller = createAnalyticsController({
    windowRef: window,
    documentRef: document,
    storage: getSafeStorage(window),
  });
  const consent = controller.initialize();
  const bar = createConsentBar(document);
  const show = () => { bar.hidden = false; };
  const hide = () => { bar.hidden = true; };

  bar.querySelector('[data-analytics-accept]')?.addEventListener('click', () => {
    controller.accept();
    hide();
  });
  bar.querySelector('[data-analytics-decline]')?.addEventListener('click', () => {
    controller.decline();
    hide();
  });
  document.querySelectorAll('[data-analytics-settings]').forEach((button) => {
    button.addEventListener('click', show);
  });

  if (consent === null) show();
};

if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  isProductionHost(window.location)
) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
