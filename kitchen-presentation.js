import { formatOptionQuantities } from './option-quantities.js';

const TABLET_WIDTH = 768;

export const getKitchenItemOptions = (item = {}) => {
  const options = Array.isArray(item.options)
    ? item.options.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const sauces = formatOptionQuantities(
    item.sauces ?? (item.sauce ? { [item.sauce]: 1 } : {}),
  );
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
  if (width < TABLET_WIDTH) return { mode: 'phone', scale: 1 };

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
    body.dataset.kitchenPresentation = presentation.mode;
    documentElement.dataset.kitchenPresentation = presentation.mode;
    body.style.setProperty('--kitchen-demo-scale', String(presentation.scale));
    body.style.setProperty('--kitchen-demo-height', `${windowRef.innerHeight}px`);

    if (guide) {
      guide.hidden = true;
      guide.setAttribute('aria-hidden', 'true');
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
