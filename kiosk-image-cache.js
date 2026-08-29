export const createKioskImageCache = (ImageConstructor = globalThis.Image) => {
  const pending = new Map();
  const ready = new Set();

  const ensure = (source) => {
    const src = String(source || '').trim();
    if (!src || typeof ImageConstructor !== 'function') {
      return Promise.resolve(false);
    }
    if (ready.has(src)) return Promise.resolve(true);
    if (pending.has(src)) return pending.get(src);

    const task = new Promise((resolve) => {
      const image = new ImageConstructor();
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        if (loaded) ready.add(src);
        pending.delete(src);
        resolve(loaded);
      };

      image.decoding = 'async';
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = src;

      if (typeof image.decode === 'function') {
        image.decode().then(() => finish(true)).catch(() => finish(false));
      } else if (image.complete) {
        finish(Boolean(image.naturalWidth));
      }
    });

    pending.set(src, task);
    return task;
  };

  const preloadProducts = (products = []) =>
    Promise.all(
      [...new Set(products.map(({ image }) => image).filter(Boolean))].map(ensure),
    );

  return {
    ensure,
    preloadProducts,
    isReady: (source) => ready.has(String(source || '').trim()),
  };
};
