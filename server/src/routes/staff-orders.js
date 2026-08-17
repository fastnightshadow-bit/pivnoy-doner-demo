import { Router } from 'express';
import { z } from 'zod';
import { authenticateRequest, requireRole } from '../auth/middleware.js';
import { DomainError } from '../domain/errors.js';
import { toCourierOrder, toStaffOrder } from '../domain/staff-order.js';

const statusSchema = z.object({
  status: z.enum([
    'accepted',
    'cooking',
    'ready',
    'courier',
    'delivered',
    'completed',
    'cancelled',
  ]),
  version: z.number().int().positive(),
  reason: z.string().max(300).optional(),
});

const historyQuerySchema = z.object({
  query: z.string().trim().max(80).optional().default(''),
  status: z.enum(['all', 'completed', 'cancelled']).optional().default('all'),
});

const cancellationSchema = z.object({
  version: z.number().int().positive(),
  reasonId: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(3).max(300),
  confirmationNumber: z.string().trim().min(1).max(20),
});

export const createStaffOrdersRouter = ({
  authService,
  orders,
  statuses,
  paymentService = null,
}) => {
  const router = Router();
  router.use(authenticateRequest(authService));
  router.use(requireRole('owner', 'kitchen', 'courier'));

  router.get('/', async (request, response) => {
    const activeOrders = await orders.listActive();
    const staffOrders = activeOrders.map(toStaffOrder);
    const visibleOrders = request.account.role === 'courier'
      ? staffOrders
        .filter(
          (order) =>
            order.fulfillment === 'delivery' &&
            ['paid', 'succeeded'].includes(order.paymentStatus),
        )
        .map(toCourierOrder)
      : staffOrders;
    response.json({ orders: visibleOrders });
  });

  router.get(
    '/history',
    requireRole('owner', 'kitchen'),
    async (request, response) => {
      const parsed = historyQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return response.status(400).json({ error: 'INVALID_HISTORY_FILTERS' });
      }
      const historyOrders = await orders.listHistory({
        ...parsed.data,
        limit: 100,
      });
      return response.json({ orders: historyOrders.map(toStaffOrder) });
    },
  );

  router.post(
    '/:id/cancel',
    requireRole('owner', 'kitchen'),
    async (request, response) => {
      const parsed = cancellationSchema.safeParse(request.body);
      if (!parsed.success) {
        return response.status(400).json({ error: 'INVALID_CANCELLATION' });
      }
      const target = await orders.findCancellationTarget(request.params.id);
      if (!target) return response.status(404).json({ error: 'ORDER_NOT_FOUND' });
      if (
        String(parsed.data.confirmationNumber) !==
        String(target.public_number ?? target.number ?? '')
      ) {
        return response
          .status(400)
          .json({ error: 'ORDER_NUMBER_CONFIRMATION_MISMATCH' });
      }

      let order = target;
      try {
        if (target.status !== 'cancelled') {
          order = await statuses.change({
            orderId: request.params.id,
            status: 'cancelled',
            version: parsed.data.version,
            reason: parsed.data.reason,
            account: request.account,
          });
        }
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        const status =
          error.code === 'STATUS_CONFLICT'
            ? 409
            : error.code === 'ORDER_NOT_FOUND'
              ? 404
              : 422;
        return response
          .status(status)
          .json({ error: error.code, details: error.details });
      }

      const refund = paymentService
        ? await paymentService.refundFull({
            orderId: request.params.id,
            reason: parsed.data.reason,
            account: request.account,
          })
        : { status: 'failed', error: 'REFUND_SERVICE_UNAVAILABLE' };
      return response.json({
        order,
        refundStatus: refund.status,
        refund: {
          status: refund.status,
          error: refund.error ?? null,
        },
      });
    },
  );

  router.patch('/:id/status', async (request, response) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'INVALID_STATUS' });
    try {
      const order = await statuses.change({
        orderId: request.params.id,
        ...parsed.data,
        account: request.account,
      });
      return response.json(order);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const status = error.code === 'STATUS_CONFLICT' ? 409 :
        error.code === 'ORDER_NOT_FOUND' ? 404 : 422;
      return response.status(status).json({ error: error.code, details: error.details });
    }
  });

  return router;
};
