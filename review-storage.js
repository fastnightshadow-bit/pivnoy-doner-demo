export const REVIEW_STORAGE_KEY = 'pivnoy-doner-reviews-v1';

const getTimestamp = (review) => {
  const timestamp = Date.parse(review?.createdAt ?? '');
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortNewestFirst = (reviews) =>
  [...reviews].sort((a, b) => getTimestamp(b) - getTimestamp(a));

export const loadReviews = (storage) => {
  if (!storage?.getItem) return [];

  try {
    const parsed = JSON.parse(storage.getItem(REVIEW_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? sortNewestFirst(parsed) : [];
  } catch {
    return [];
  }
};

export const findReviewByOrderId = (storage, orderId) => {
  const normalizedOrderId = String(orderId ?? '').trim();
  if (!normalizedOrderId) return null;

  return (
    loadReviews(storage).find(
      (review) => String(review?.orderId ?? '') === normalizedOrderId,
    ) ?? null
  );
};

export const saveReview = (storage, review) => {
  if (!storage?.setItem || !review || typeof review !== 'object') {
    throw new Error('review-storage-unavailable');
  }

  const orderId = String(review.orderId ?? '').trim();
  if (!orderId) throw new Error('invalid-review');
  if (findReviewByOrderId(storage, orderId)) {
    throw new Error('already-reviewed');
  }

  const reviews = sortNewestFirst([...loadReviews(storage), review]);
  storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviews));
  return review;
};
