export const MOTION_DURATIONS = Object.freeze({
  press: 120,
  state: 180,
  panel: 300,
  page: 200,
  pageExit: 140,
});

export const getMotionDuration = (kind, reducedMotion = false) =>
  reducedMotion ? 0 : (MOTION_DURATIONS[kind] ?? MOTION_DURATIONS.state);

export const classifyNavigation = ({
  href = '',
  currentHref = 'http://localhost/',
  back = false,
  modified = false,
  target = '',
  download = false,
} = {}) => {
  if (!href || modified || download || (target && target !== '_self')) {
    return 'skip';
  }

  const current = new URL(currentHref);
  const next = new URL(href, current);
  const sameDocument =
    next.origin === current.origin &&
    next.pathname === current.pathname &&
    next.search === current.search;

  if (next.origin !== current.origin || sameDocument) return 'skip';
  return back ? 'back' : 'forward';
};

const restartMotionClass = (element, className) => {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
};

export const pulseMotion = (element, className = 'motion-pulse') => {
  restartMotionClass(element, className);
  globalThis.setTimeout(
    () => element?.classList.remove(className),
    getMotionDuration('state'),
  );
};

export const staggerMotion = (root, selector) => {
  root?.querySelectorAll(selector).forEach((element, index) => {
    element.classList.add('motion-stagger-item');
    element.style.setProperty('--motion-index', String(Math.min(index, 6)));
  });
};

export const revealMotion = (element) => {
  restartMotionClass(element, 'motion-panel-enter');
  globalThis.setTimeout(
    () => element?.classList.remove('motion-panel-enter'),
    getMotionDuration('panel'),
  );
};

const NAVIGATION_DIRECTION_KEY = 'pd-motion-entry';

export const getPageTransitionMode = ({
  supported = false,
  reducedMotion = false,
} = {}) => {
  if (reducedMotion) return 'none';
  return supported ? 'native' : 'fallback';
};

export const shouldUseNativePageTransition = (options = {}) =>
  getPageTransitionMode(options) === 'native';

export const readNavigationDirection = (sessionRef = globalThis.sessionStorage) => {
  const direction = sessionRef?.getItem?.(NAVIGATION_DIRECTION_KEY);
  return direction === 'back' ? 'back' : 'forward';
};

export const recordNavigationDirection = ({
  direction,
  documentRef = globalThis.document,
  sessionRef = globalThis.sessionStorage,
} = {}) => {
  if (!['forward', 'back'].includes(direction)) return;
  if (documentRef?.documentElement) {
    documentRef.documentElement.dataset.motionDirection = direction;
  }
  sessionRef?.setItem?.(NAVIGATION_DIRECTION_KEY, direction);
};

export const initMotionNavigation = ({
  documentRef = globalThis.document,
  sessionRef = globalThis.sessionStorage,
  locationRef = globalThis.location,
  matchMediaRef = globalThis.matchMedia,
  setTimeoutRef = globalThis.setTimeout,
} = {}) => {
  if (!documentRef || !locationRef) return;

  const reducedMotion = Boolean(
    matchMediaRef?.('(prefers-reduced-motion: reduce)')?.matches,
  );
  const supported = Boolean(documentRef.startViewTransition);
  const transitionMode = getPageTransitionMode({ supported, reducedMotion });
  const entryDirection = readNavigationDirection(sessionRef);
  const root = documentRef.documentElement;

  if (transitionMode === 'native' && root) {
    root.dataset.motionDirection = entryDirection;
  } else if (transitionMode === 'fallback' && root) {
    root.classList.add('motion-page-enter');
    setTimeoutRef(
      () => root.classList.remove('motion-page-enter'),
      MOTION_DURATIONS.page,
    );
  }
  sessionRef?.removeItem?.(NAVIGATION_DIRECTION_KEY);

  let navigating = false;
  documentRef.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || event.defaultPrevented || event.button > 0) return;

    const direction = classifyNavigation({
      href: anchor.href,
      currentHref: locationRef.href,
      back: anchor.hasAttribute('data-motion-back'),
      modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
      target: anchor.target,
      download: anchor.hasAttribute('download'),
    });
    if (direction === 'skip') return;
    recordNavigationDirection({ direction, documentRef, sessionRef });

    if (transitionMode !== 'fallback') return;
    event.preventDefault();
    if (navigating) return;
    navigating = true;
    root?.classList.remove('motion-page-enter');
    root?.classList.add('motion-page-exit');
    setTimeoutRef(
      () => locationRef.assign(anchor.href),
      MOTION_DURATIONS.pageExit,
    );
  });
};

if (typeof document !== 'undefined') initMotionNavigation();
