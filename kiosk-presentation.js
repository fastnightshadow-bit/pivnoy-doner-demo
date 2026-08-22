const backIcon = `
  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <path d="m15 5-7 7 7 7" />
  </svg>`;

const brand = `
  <img
    class="kiosk-brand"
    src="assets/mobile-home/brand-wordmark.webp"
    alt="Пивной Донер"
    width="244"
    height="92"
  />`;

const renderStart = (context) => `
  <section class="kiosk-screen kiosk-start" aria-labelledby="kiosk-start-title">
    <div class="kiosk-start__copy">
      ${brand}
      <p class="kiosk-eyebrow">Готовим сочно. Подаём быстро.</p>
      <h1 id="kiosk-start-title">Вкус, который<br />хочется <span>повторить</span></h1>
      <p class="kiosk-lead">Соберите свой заказ за пару касаний</p>
      <button class="kiosk-primary kiosk-touch" type="button" data-kiosk-start>
        Начать заказ
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>
      </button>
    </div>
    <div class="kiosk-start__visual" aria-hidden="true">
      <div class="kiosk-start__halo"></div>
      <img src="assets/mobile-home/hero-enhanced.webp" alt="" />
    </div>
    <div class="kiosk-start__status" aria-label="Статус стойки">
      <span class="kiosk-status-dot${context.connected === false ? ' is-offline' : ''}"></span>
      ${context.settings?.acceptingOrders === false ? 'Приём заказов приостановлен' : 'Стойка готова к заказу'}
    </div>
  </section>`;

const renderFulfillment = () => `
  <section class="kiosk-screen kiosk-choice" aria-labelledby="kiosk-choice-title">
    <header class="kiosk-topbar">
      <button class="kiosk-icon-button kiosk-touch" type="button" data-kiosk-back aria-label="Назад">
        ${backIcon}
      </button>
      ${brand}
      <span class="kiosk-topbar__spacer" aria-hidden="true"></span>
    </header>
    <div class="kiosk-choice__content">
      <p class="kiosk-eyebrow">Шаг 1 из 3</p>
      <h1 id="kiosk-choice-title">Где будете есть?</h1>
      <p class="kiosk-lead">Вы сможете изменить выбор в корзине</p>
      <div class="kiosk-choice__grid">
        <button class="kiosk-choice-card kiosk-touch" type="button" data-kiosk-fulfillment="dine-in">
          <span class="kiosk-choice-card__icon" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path d="M8 36h32M12 36c0-10 5-18 12-18s12 8 12 18M24 18v-6m-4 0h8" /></svg>
          </span>
          <strong>Здесь</strong>
          <small>Подадим заказ в ресторане</small>
        </button>
        <button class="kiosk-choice-card kiosk-touch" type="button" data-kiosk-fulfillment="takeaway">
          <span class="kiosk-choice-card__icon" aria-hidden="true">
            <svg viewBox="0 0 48 48"><path d="M13 15h22l-2 25H15l-2-25Zm6 0V9h10v6" /></svg>
          </span>
          <strong>С собой</strong>
          <small>Надёжно упакуем заказ</small>
        </button>
      </div>
    </div>
  </section>`;

const renderCatalogPlaceholder = (state) => `
  <section class="kiosk-screen kiosk-placeholder" aria-labelledby="kiosk-placeholder-title">
    <header class="kiosk-topbar">
      ${brand}
      <span class="kiosk-topbar__spacer" aria-hidden="true"></span>
    </header>
    <div>
      <p class="kiosk-eyebrow">${state.fulfillment === 'dine-in' ? 'Заказ здесь' : 'Заказ с собой'}</p>
      <h1 id="kiosk-placeholder-title">Выберите блюда</h1>
      <p class="kiosk-lead">Меню загружается…</p>
    </div>
  </section>`;

export const renderKiosk = (state, context = {}) => {
  if (state.screen === 'start') return renderStart(context);
  if (state.screen === 'fulfillment') return renderFulfillment();
  return renderCatalogPlaceholder(state);
};
