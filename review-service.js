import { createReview } from './review-state.js';
import {
  findReviewByOrderId,
  loadReviews,
  saveReview,
} from './review-storage.js';

export const createReviewService = ({
  storage = globalThis.localStorage,
} = {}) => ({
  list: async () => loadReviews(storage),
  findByOrderId: async (orderId) => findReviewByOrderId(storage, orderId),
  submit: async (draft) => {
    const review = createReview(draft);
    if (!review) throw new Error('invalid-review');
    return saveReview(storage, review);
  },
});
