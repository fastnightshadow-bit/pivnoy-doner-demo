(() => {
  const key = 'pivnoy-doner-theme-v1';
  let theme = 'light';

  try {
    if (globalThis.localStorage?.getItem(key) === 'dark') theme = 'dark';
  } catch {
    theme = 'light';
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
