import { DomainError } from '../domain/errors.js';

export const createStatusService = ({ orders }) => ({
  change: async ({ orderId, status, version, account, reason = '' }) => {
    const result = await orders.transitionStatus({
      orderId,
      status,
      version,
      account,
      reason,
    });
    if (result?.conflict) {
      throw new DomainError('STATUS_CONFLICT', {
        version: result.currentVersion,
      });
    }
    if (result?.forbidden) throw new DomainError('INVALID_STATUS_TRANSITION');
    if (!result) throw new DomainError('ORDER_NOT_FOUND');
    return result;
  },
});
