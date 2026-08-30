import { calculateCartSummary } from './cart-state.js';

const money = (value) => `${new Intl.NumberFormat('ru-RU').format(Number(value) || 0)} ₽`;
const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const back = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></svg>';
const brand = '<img class="kiosk-brand" src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" />';

const cardIcon = `<span class="kiosk-payment-icon" aria-hidden="true">
  <svg viewBox="0 0 24 24" focusable="false">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="M3.5 9.5h17M7 14.5h4" />
  </svg>
</span>`;

const qrIcon = `<span class="kiosk-payment-icon" aria-hidden="true">
  <svg viewBox="0 0 24 24" focusable="false">
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
    <path d="M14 14h2v2h-2zM18 14h2v4h-2zM14 18h4v2h-4z" />
  </svg>
</span>`;

const shell = (content, { backButton = true, className = '' } = {}) => `
  <section class="kiosk-screen kiosk-payment ${className}">
    <header>${backButton ? `<button class="kiosk-icon-button kiosk-touch" type="button" data-kiosk-back aria-label="Назад">${back}</button>` : '<span></span>'}${brand}<span></span></header>
    ${content}
  </section>`;

const renderMethod = (state, context) => shell(`
  <main class="kiosk-payment-method">
    <p class="kiosk-eyebrow">Шаг 3 из 3</p><h1>Выберите способ оплаты</h1><p>К оплате <strong>${money(calculateCartSummary(state.lines).total)}</strong></p>
    <div class="kiosk-payment-options">
      <button class="kiosk-payment-option kiosk-touch" type="button" data-kiosk-payment="card">${cardIcon}<span><strong>Оплатить картой</strong><small>Приложите карту или телефон к терминалу</small></span><b aria-hidden="true">›</b></button>
      <button class="kiosk-payment-option kiosk-touch" type="button" data-kiosk-payment="qr">${qrIcon}<span><strong>Оплатить по QR-коду</strong><small>Через приложение вашего банка</small></span><b aria-hidden="true">›</b></button>
    </div>
    <section class="kiosk-receipt-fields">
      <label><span>Телефон для электронного чека при оплате по QR</span><input type="tel" inputmode="tel" autocomplete="tel" data-kiosk-fiscal-phone placeholder="+7 999 000-00-00" value="${escapeHtml(context.fiscalPhone || '')}" /></label>
      <label class="kiosk-consent"><input type="checkbox" data-kiosk-personal-consent ${context.personalDataConsent ? 'checked' : ''} /><span>Согласен на обработку номера для формирования чека и принимаю оферту</span></label>
      ${context.paymentFormError ? `<p role="alert">${escapeHtml(context.paymentFormError)}</p>` : ''}
    </section>
    <aside><span>Итого</span><strong>${money(calculateCartSummary(state.lines).total)}</strong></aside>
  </main>`);

const renderCard = (context) => shell(`
  <main class="kiosk-payment-process">
    <p class="kiosk-eyebrow">Оплата картой</p><h1>Приложите карту</h1><p>или телефон к терминалу справа от экрана</p>
    <div class="kiosk-terminal-art" aria-hidden="true">
      <div class="kiosk-terminal-device"><span></span><b>••••</b><i>)))</i></div>
      <div class="kiosk-payment-card-art"><span></span><i></i></div>
    </div>
    ${context.terminalState === 'unavailable'
      ? '<strong class="kiosk-payment-status is-unavailable">Терминал ещё не подключён</strong><small>Деньги не списаны. Оплатите заказ по QR-коду.</small><button class="kiosk-primary kiosk-touch kiosk-use-qr" type="button" data-kiosk-use-qr>Перейти к оплате по QR</button>'
      : '<strong class="kiosk-payment-status"><i></i>Терминал ожидает оплату</strong><small>Показываем, как будет работать подключённый терминал.</small>'}
  </main>`, { className: 'is-process' });

const renderQr = (context) => shell(`
  <main class="kiosk-payment-process">
    <p class="kiosk-eyebrow">Оплата по QR-коду</p><h1>Наведите камеру</h1><p>Откройте приложение банка и отсканируйте код</p>
    <div class="kiosk-qr${context.qrSvg ? '' : ' is-loading'}" data-kiosk-qr aria-label="QR-код для оплаты">${context.qrSvg || '<span>Создаём QR…</span>'}</div>
    <strong class="kiosk-payment-status"><i></i>${context.qrSvg ? 'Ожидаем оплату' : 'Подготавливаем оплату'}</strong><small>После оплаты экран сменится автоматически.</small>
  </main>`, { className: 'is-process' });

const renderSuccess = (state) => shell(`
  <main class="kiosk-payment-result is-success"><div class="kiosk-result-icon">✓</div><p class="kiosk-eyebrow">Всё получилось</p><h1>Заказ принят!</h1><strong>№ ${escapeHtml(state.order?.number || '—')}</strong><p>Мы уже начали готовить ваш заказ</p><small>Этот экран вернётся в начало автоматически</small><button class="kiosk-secondary kiosk-touch" type="button" data-kiosk-reset>На главный экран</button></main>`, { backButton: false, className: 'is-result' });

const renderError = (state) => shell(`
  <main class="kiosk-payment-result is-error"><div class="kiosk-result-icon">!</div><p class="kiosk-eyebrow">Оплата не завершена</p><h1>${escapeHtml(state.error || 'Оплата не прошла')}</h1><p>Деньги не списаны. Попробуйте ещё раз или выберите другой способ.</p><button class="kiosk-primary kiosk-touch" type="button" data-kiosk-payment-retry>Повторить оплату</button><button class="kiosk-secondary kiosk-touch" type="button" data-kiosk-back>Выбрать другой способ</button></main>`, { backButton: false, className: 'is-result' });

export const renderKioskPayment = (state, context = {}) => {
  if (state.screen === 'payment-method') return renderMethod(state, context);
  if (state.screen === 'card-payment') return renderCard(context);
  if (state.screen === 'qr-payment') return renderQr(context);
  if (state.screen === 'success') return renderSuccess(state);
  return renderError(state);
};
