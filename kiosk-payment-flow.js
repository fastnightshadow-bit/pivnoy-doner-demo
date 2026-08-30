export const createKioskPaymentController = ({
  api,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) => {
  let cardTimer = 0;
  const stopCardAnimation = () => {
    if (cardTimer) clearTimeoutImpl(cardTimer);
    cardTimer = 0;
  };
  return {
    showCardAnimation(onState) {
      stopCardAnimation();
      onState('waiting');
      cardTimer = setTimeoutImpl(() => {
        cardTimer = 0;
        onState('unavailable');
      }, 1800);
    },
    stopCardAnimation,
    createQrOrder: (payload, operationId) =>
      api.createOrder(payload, operationId),
    getPaymentStatus: (orderId) => api.getPaymentStatus(orderId),
  };
};
