export const THEME_STORAGE_KEY = 'pivnoy-doner-theme-v1';

export const normalizeTheme = (value) =>
  value === 'dark' ? 'dark' : 'light';

export const readTheme = (storage = globalThis.localStorage) => {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'light';
  }
};

export const toggleTheme = (theme) =>
  normalizeTheme(theme) === 'dark' ? 'light' : 'dark';

export const applyTheme = (
  theme,
  root = globalThis.document?.documentElement,
  meta = globalThis.document?.querySelector?.('meta[name="theme-color"]'),
) => {
  const next = normalizeTheme(theme);
  if (root) {
    root.dataset.theme = next;
    root.style.colorScheme = next;
  }
  meta?.setAttribute?.('content', next === 'dark' ? '#111111' : '#ffffff');
  return next;
};

const syncThemeControls = (documentRef, theme) => {
  const isDark = theme === 'dark';
  documentRef?.querySelectorAll?.('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute(
      'aria-label',
      isDark ? 'Включить светлую тему' : 'Включить тёмную тему',
    );
    button
      .querySelector('[data-theme-icon="moon"]')
      ?.toggleAttribute('hidden', isDark);
    button
      .querySelector('[data-theme-icon="sun"]')
      ?.toggleAttribute('hidden', !isDark);
  });
};

export const initThemeControls = ({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  storage = globalThis.localStorage,
} = {}) => {
  if (!documentRef?.documentElement) return () => {};

  let current = applyTheme(
    readTheme(storage),
    documentRef.documentElement,
    documentRef.querySelector?.('meta[name="theme-color"]'),
  );
  syncThemeControls(documentRef, current);

  const onClick = (event) => {
    if (!event.target.closest?.('[data-theme-toggle]')) return;
    current = toggleTheme(current);
    try {
      storage?.setItem(THEME_STORAGE_KEY, current);
    } catch {
      // The page can still switch theme when storage is blocked.
    }
    applyTheme(
      current,
      documentRef.documentElement,
      documentRef.querySelector?.('meta[name="theme-color"]'),
    );
    syncThemeControls(documentRef, current);
  };

  const onStorage = (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    current = applyTheme(
      event.newValue,
      documentRef.documentElement,
      documentRef.querySelector?.('meta[name="theme-color"]'),
    );
    syncThemeControls(documentRef, current);
  };

  documentRef.addEventListener('click', onClick);
  windowRef?.addEventListener?.('storage', onStorage);

  return () => {
    documentRef.removeEventListener('click', onClick);
    windowRef?.removeEventListener?.('storage', onStorage);
  };
};

if (globalThis.document?.documentElement) initThemeControls();
