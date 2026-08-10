import { createReview } from './review-state.js';
import {
  findReviewByOrderId,
  loadReviews,
  saveReview,
} from './review-storage.js';

export const createReviewService = ({
  storage = globalThis.localStorage,
  api = null,
} = {}) => ({
  list: async () => (api ? api.listReviews() : loadReviews(storage)),
  findByOrderId: async (orderId) =>
    api ? api.findReviewByOrderId(orderId) : findReviewByOrderId(storage, orderId),
  submit: async (draft) => {
    const review = createReview(draft);
    if (!review) throw new Error('invalid-review');
    if (api) {
      return api.submitReview(review.orderId, {
        rating: review.rating,
        authorName: review.authorName,
        comment: review.comment,
      });
    }
    return saveReview(storage, review);
  },
});
