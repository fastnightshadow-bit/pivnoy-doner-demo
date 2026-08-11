const RETENTION_COUNT_KEYS = Object.freeze([
  'deliveryDetailsAnonymized',
  'customerContactsAnonymized',
  'privateReviewsDeleted',
  'revokedReviewsDeleted',
  'expiredSessionsDeleted',
  'staffActorsAnonymized',
  'providerPayloadsCleared',
]);

const sanitizeCounts = (counts) =>
  Object.fromEntries(
    RETENTION_COUNT_KEYS.map((key) => {
      const value = Number(counts?.[key]);
      return [key, Number.isSafeInteger(value) && value >= 0 ? value : 0];
    }),
  );

export const createRetentionService = ({ retention, log = console.log }) => {
  const previewRetention = async (now) => {
    const counts = sanitizeCounts(await retention.previewRetention(now));
    log(JSON.stringify({ mode: 'dry-run', counts }));
    return counts;
  };

  const applyRetention = async (now) => {
    const counts = sanitizeCounts(await retention.applyRetention(now));
    log(JSON.stringify({ mode: 'apply', counts }));
    return counts;
  };

  return { previewRetention, applyRetention };
};
