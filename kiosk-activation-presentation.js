const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export const renderKioskActivation = ({ error = '', pending = false } = {}) => `
  <section class="kiosk-screen kiosk-activation">
    <form class="kiosk-activation__card" data-kiosk-activation-form>
      <img class="kiosk-brand" src="assets/mobile-home/brand-wordmark.webp" alt="Пивной Донер" />
      <p class="kiosk-eyebrow">Первый запуск</p>
      <h1>Подключение киоска</h1>
      <p>В кабинете владельца нажмите «Создать код» и введите сюда 6-значный код.</p>
      <label><span>Название планшета</span><input data-kiosk-device-name name="displayName" autocomplete="organization-title" maxlength="80" value="Киоск у входа" required /></label>
      <label><span>Код подключения</span><input data-kiosk-activation-code name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required /></label>
      ${error ? `<p class="kiosk-activation__error" role="alert">${escapeHtml(error)}</p>` : ''}
      <button class="kiosk-primary kiosk-touch" type="submit" ${pending ? 'disabled' : ''}>${pending ? 'Подключаем…' : 'Подключить планшет'}</button>
    </form>
  </section>`;
