export const createRefundRetryWorker = ({
  payments,
  paymentService,
  logger = console,
  limit = 20,
} = {}) => {
  if (typeof payments?.listRefundsForRetry !== 'function') {
    throw new TypeError('refund retry repository is required');
  }
  if (typeof paymentService?.refundFull !== 'function') {
    throw new TypeError('refund payment service is required');
  }

  let running = false;

  return {
    tick: async () => {
      if (running) {
        return { processed: 0, succeeded: 0, skipped: true };
      }
      running = true;
      let processed = 0;
      let succeeded = 0;
      try {
        const refunds = await payments.listRefundsForRetry({ limit });
        for (const refund of refunds) {
          processed += 1;
          try {
            const result = await paymentService.refundFull({
              orderId: refund.orderId,
              reason: refund.reason,
              account: refund.requestedBy
                ? { id: refund.requestedBy }
                : null,
            });
            if (result?.status === 'succeeded') succeeded += 1;
          } catch (error) {
            logger.error?.(
              'Refund retry failed',
              String(error?.code || error?.name || 'Error'),
            );
          }
        }
        return { processed, succeeded };
      } finally {
        running = false;
      }
    },
  };
};

export const startRefundRetryLoop = ({
  worker,
  pollMs = 60_000,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  logger = console,
} = {}) => {
  if (typeof worker?.tick !== 'function') {
    throw new TypeError('refund retry worker is required');
  }
  const run = () =>
    worker.tick().catch((error) => {
      logger.error?.(
        'Refund retry cycle failed',
        String(error?.code || error?.name || 'Error'),
      );
    });
  void run();
  const timer = setIntervalFn(run, pollMs);
  timer?.unref?.();
  return () => clearIntervalFn(timer);
};
