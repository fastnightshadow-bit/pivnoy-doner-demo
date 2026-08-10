import { Router } from 'express';
import { z } from 'zod';
import { authenticateRequest, requireRole } from '../auth/middleware.js';
import { DomainError } from '../domain/errors.js';

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

export const createStaffOrdersRouter = ({ authService, orders, statuses }) => {
  const router = Router();
  router.use(authenticateRequest(authService));
  router.use(requireRole('owner', 'kitchen', 'courier'));

  router.get('/', async (_request, response) => {
    response.json({ orders: await orders.listActive() });
  });

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
