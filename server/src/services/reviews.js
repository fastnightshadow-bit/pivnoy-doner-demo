import { LEGAL_VERSIONS } from '../../../shared/legal.js';

class ReviewServiceError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export const createReviewsService = ({ reviews }) => ({
  list: () => reviews.list(),
  findByOrderId: (orderId) => reviews.findByOrderId(orderId),
  submit: async (orderId, draft) => {
    if (
      draft.publicationConsent === true &&
      draft.publicationConsentVersion !== LEGAL_VERSIONS.reviewPublication
    ) {
      throw new ReviewServiceError('LEGAL_VERSION_OUTDATED', 409);
    }
    const result = await reviews.createForCompletedOrder(orderId, draft);
    if (result.missing) throw new ReviewServiceError('ORDER_NOT_FOUND', 404);
    if (result.notCompleted) {
      throw new ReviewServiceError('ORDER_NOT_COMPLETED', 409);
    }
    if (result.duplicate) {
      throw new ReviewServiceError('ALREADY_REVIEWED', 409);
    }
    return result.review;
  },
});
