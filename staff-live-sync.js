export const createStaffLiveSync = ({
  refresh,
  subscribe = () => () => {},
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  isVisible = () => true,
  intervalMs = 5000,
} = {}) => {
  let refreshPromise = null;
  let trailingRefreshPromise = null;
  let intervalId = null;
  let unsubscribe = null;

  const startRefresh = () => {
    refreshPromise = Promise.resolve()
      .then(() => refresh())
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  };

  const sync = () => {
    if (!isVisible()) return Promise.resolve();
    if (!refreshPromise) return startRefresh();
    if (!trailingRefreshPromise) {
      trailingRefreshPromise = refreshPromise
        .catch(() => undefined)
        .then(() => {
          trailingRefreshPromise = null;
          if (!isVisible()) return undefined;
          return startRefresh();
        });
    }
    return trailingRefreshPromise;
  };

  const stop = () => {
    unsubscribe?.();
    unsubscribe = null;
    if (intervalId !== null) clearIntervalFn(intervalId);
    intervalId = null;
  };

  const start = (onEvent, onConnection = () => {}) => {
    stop();
    unsubscribe = subscribe(onEvent, onConnection);
    intervalId = setIntervalFn(() => void sync().catch(() => {}), intervalMs);
  };

  return { start, stop, sync };
};

export const executeVersionedAction = async ({
  entityId,
  initialVersion,
  execute,
  refresh,
  canRetry,
}) => {
  try {
    return await execute(initialVersion);
  } catch (error) {
    if (error?.status !== 409) throw error;
    const entities = await refresh();
    const entity = (Array.isArray(entities) ? entities : []).find(
      ({ id }) => id === entityId,
    );
    if (!entity || !canRetry(entity)) {
      return { refreshed: true, alreadyChanged: true, entity: entity || null };
    }
    return execute(entity.version);
  }
};
