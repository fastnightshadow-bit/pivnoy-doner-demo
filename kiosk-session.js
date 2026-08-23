export const createKioskSessionController = ({
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  onWarn = () => {},
  onReset = () => {},
} = {}) => {
  let timerIds = [];
  const clear = () => {
    timerIds.forEach((id) => clearTimeoutImpl(id));
    timerIds = [];
  };
  const after = (delay, callback) => {
    timerIds.push(setTimeoutImpl(callback, delay));
  };
  const sync = (state = {}) => {
    clear();
    if (!state.screen || state.screen === 'start') return;
    if (state.screen === 'success') {
      after(10_000, onReset);
      return;
    }
    if (Array.isArray(state.lines) && state.lines.length > 0) {
      after(60_000, onWarn);
      after(70_000, onReset);
      return;
    }
    after(30_000, onReset);
  };
  return { clear, sync, activity: sync };
};
