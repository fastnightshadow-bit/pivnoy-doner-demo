import { Router } from 'express';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';

const quantitiesSchema = z.record(z.string().min(1), z.coerce.number().int().min(0).max(5));
const orderSchema = z.object({
  fulfillment: z.enum(['pickup', 'delivery']),
  customer: z.object({
    name: z.string().max(80).default(''),
    phone: z.string().min(10).max(32),
  }),
  address: z.record(z.string(), z.string().max(160)).optional(),
  comment: z.string().max(500).optional(),
  courierComment: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(80),
        quantity: z.coerce.number().int().min(1).max(20),
        meat: z.string().max(40).optional(),
        size: z.string().max(40).optional(),
        addons: quantitiesSchema.optional(),
        sauces: quantitiesSchema.optional(),
        unitPrice: z.number().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const createOrdersRouter = ({ orderService }) => {
  const router = Router();

  router.post('/', async (request, response) => {
    const idempotencyKey = String(request.get('Idempotency-Key') ?? '').trim();
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return response.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY' });
    }

    try {
      const input = orderSchema.parse(request.body);
      const result = await orderService.create(input, idempotencyKey);
      return response.status(result.created ? 201 : 200).json(result.order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return response.status(400).json({ error: 'INVALID_ORDER' });
      }
      if (error instanceof DomainError) {
        return response.status(422).json({
          error: error.code,
          details: error.details,
        });
      }
      throw error;
    }
  });

  return router;
};
