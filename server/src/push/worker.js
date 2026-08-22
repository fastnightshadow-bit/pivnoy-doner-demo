const toErrorText = (error) => {
  const message = String(error?.message || error?.statusCode || 'push delivery failed');
  return message.slice(0, 500);
};

const isStaleSubscriptionError = (error) =>
  Number(error?.statusCode ?? error?.status) === 404 ||
  Number(error?.statusCode ?? error?.status) === 410;

export const createPushWorker = ({
  repository,
  sender,
  maxAttempts = 5,
  baseDelayMs = 1_000,
  maxDelayMs = 60_000,
}) => {
  let inFlight = null;

  const processNext = async () => {
    const job = await repository.claimNextJob();
    if (!job) return false;

    const subscriptions = await repository.listActiveCourierSubscriptions();
    if (subscriptions.length === 0) {
      await repository.markJobSent(job.id);
      return true;
    }

    let delivered = 0;
    const transientErrors = [];
    for (const subscription of subscriptions) {
      try {
        await sender.send(subscription, job.payload);
        delivered += 1;
        await repository.markSubscriptionSuccess(subscription.endpoint);
      } catch (error) {
        const errorText = toErrorText(error);
        if (isStaleSubscriptionError(error)) {
          await repository.deactivateSubscription(subscription.endpoint, errorText);
        } else {
          transientErrors.push(errorText);
        }
      }
    }

    if (delivered > 0 || transientErrors.length === 0) {
      await repository.markJobSent(job.id);
      return true;
    }

    const errorText = transientErrors.join('; ').slice(0, 500);
    if (job.attempts >= maxAttempts) {
      await repository.markJobDead(job.id, errorText);
      return true;
    }

    const delayMs = Math.min(
      maxDelayMs,
      baseDelayMs * 2 ** Math.max(0, job.attempts - 1),
    );
    await repository.rescheduleJob(job.id, errorText, delayMs);
    return true;
  };

  return {
    tick: () => {
      if (inFlight) return inFlight;
      inFlight = processNext().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
};
