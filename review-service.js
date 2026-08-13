import { createReview } from './review-state.js?v=2026081402';
import { LEGAL_VERSIONS } from './shared/legal.js?v=20260811';
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
  findByOrderId: async (orderId, accessToken) =>
    api
      ? api.findReviewByOrderId(orderId, accessToken)
      : findReviewByOrderId(storage, orderId),
  submit: async (draft, accessToken) => {
    const review = createReview(draft);
    if (!review) throw new Error('invalid-review');
    if (api) {
      const payload = {
        rating: review.rating,
        authorName: review.authorName,
        comment: review.comment,
        publicationConsent: review.publicationConsent,
        ...(review.publicationConsent
          ? {
              publicationConsentVersion:
                LEGAL_VERSIONS.reviewPublication,
            }
          : {}),
      };
      return api.submitReview(
        review.orderId,
        payload,
        accessToken,
      );
    }
    return saveReview(storage, review);
  },
});
