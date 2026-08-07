import { formatOptionQuantities } from './option-quantities.js';

const TABLET_WIDTH = 768;

export const getKitchenItemOptions = (item = {}) => {
  const options = Array.isArray(item.options)
    ? item.options.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const sauces = [
    ...new Set(
      (Array.isArray(item.sauces)
        ? item.sauces
        : item.sauce
          ? [item.sauce]
          : []
      )
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ];
  const sauceLabel = sauces.length
    ? `${sauces.length === 1 ? 'Соус' : 'Соусы'}: ${sauces.join(', ')}`
    : '';
  const addonLabels = formatOptionQuantities(item.addons);
  const addonLabel = addonLabels.length
    ? `Добавки: ${addonLabels.join(', ')}`
    : '';
  return [
    ...options,
    ...(sauceLabel && !options.includes(sauceLabel) ? [sauceLabel] : []),
    ...(addonLabel && !options.includes(addonLabel) ? [addonLabel] : []),
  ];
};

export function getKitchenPresentation({ width, height }) {
  if (width < TABLET_WIDTH && height >= width) {
    return { mode: 'portrait-phone', scale: 1 };
  }

  if (width < TABLET_WIDTH) {
    return { mode: 'scaled-landscape-phone', scale: width / TABLET_WIDTH };
  }

  return { mode: 'tablet', scale: 1 };
}

export function initKitchenPresentation({ windowRef, documentRef } = {}) {
  if (!windowRef || !documentRef) return () => {};

  const body = documentRef.body;
  const documentElement = documentRef.documentElement;
  const guide = documentRef.querySelector('[data-kitchen-orientation]');

  const update = () => {
    const presentation = getKitchenPresentation({
      width: windowRef.innerWidth,
      height: windowRef.innerHeight,
    });
    const virtualHeight = presentation.mode === 'scaled-landscape-phone'
      ? windowRef.innerHeight / presentation.scale
      : windowRef.innerHeight;

    body.dataset.kitchenPresentation = presentation.mode;
    documentElement.dataset.kitchenPresentation = presentation.mode;
    body.style.setProperty('--kitchen-demo-scale', String(presentation.scale));
    body.style.setProperty('--kitchen-demo-height', `${virtualHeight}px`);

    if (guide) {
      const isVisible = presentation.mode === 'portrait-phone';
      guide.hidden = !isVisible;
      guide.setAttribute('aria-hidden', String(!isVisible));
    }
  };

  update();
  windowRef.addEventListener('resize', update);
  windowRef.addEventListener('orientationchange', update);

  return () => {
    windowRef.removeEventListener('resize', update);
    windowRef.removeEventListener('orientationchange', update);
  };
}
