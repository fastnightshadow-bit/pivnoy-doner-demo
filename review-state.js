const cleanText = (value, maxLength) =>
  String(value ?? '').trim().slice(0, maxLength);

export const isReviewableOrder = (order = {}) =>
  order.status === 'completed' ||
  (order.fulfillment === 'delivery' && order.status === 'delivered');

export const normalizeReviewDraft = (value = {}) => {
  const orderId = cleanText(value.orderId, 120);
  const rating = Number(value.rating);

  if (!orderId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return null;
  }

  return {
    orderId,
    rating,
    comment: cleanText(value.comment, 500),
    authorName: cleanText(value.authorName, 80) || 'Покупатель',
  };
};

export const createReview = (value, now = new Date()) => {
  const draft = normalizeReviewDraft(value);
  if (!draft) return null;

  const createdAtDate =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  return {
    ...draft,
    id: `${draft.orderId}-${createdAtDate.getTime()}`,
    createdAt: createdAtDate.toISOString(),
    published: true,
    verified: false,
  };
};

export const getReviewSummary = (reviews = []) => {
  const ratings = (Array.isArray(reviews) ? reviews : [])
    .map((review) => Number(review?.rating))
    .filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5);

  if (!ratings.length) return { average: 0, count: 0 };

  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return {
    average: Number((total / ratings.length).toFixed(1)),
    count: ratings.length,
  };
};
