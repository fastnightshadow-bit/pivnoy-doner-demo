import { Router } from 'express';
import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { PaymentProviderError } from '../payments/provider.js';

const quantitiesSchema = z.record(z.string().min(1), z.coerce.number().int().min(0).max(5));
const orderSchema = z.object({
  fulfillment: z.enum(['pickup', 'delivery']),
  personalDataConsent: z.literal(true),
  personalDataConsentVersion: z.string().min(1).max(40),
  offerVersion: z.string().min(1).max(40),
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

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  authorName: z.string().max(80).optional(),
  comment: z.string().max(500).optional(),
});

export const createOrdersRouter = ({
  orderService,
  reviewsService = null,
  paymentService = null,
}) => {
  const router = Router();

  if (typeof orderService.get === 'function') {
    router.get('/:id', async (request, response) => {
      const order = await orderService.get(String(request.params.id));
      if (!order) return response.status(404).json({ error: 'ORDER_NOT_FOUND' });
      return response.json(order);
    });
  }

  if (reviewsService) {
    router.get('/:id/review', async (request, response) => {
      const review = await reviewsService.findByOrderId(String(request.params.id));
      if (!review) return response.status(404).json({ error: 'REVIEW_NOT_FOUND' });
      return response.json(review);
    });

    router.post('/:id/review', async (request, response) => {
      try {
        const draft = reviewSchema.parse(request.body);
        const review = await reviewsService.submit(String(request.params.id), draft);
        return response.status(201).json(review);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({ error: 'INVALID_REVIEW' });
        }
        if (error?.status) {
          return response.status(error.status).json({ error: error.code });
        }
        throw error;
      }
    });
  }

  router.post('/', async (request, response) => {
    const idempotencyKey = String(request.get('Idempotency-Key') ?? '').trim();
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return response.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY' });
    }

    try {
      const input = orderSchema.parse(request.body);
      const result = await orderService.create(input, idempotencyKey);
      const payment = paymentService
        ? await paymentService.create(result.order.id, result.order.id)
        : null;
      return response.status(result.created ? 201 : 200).json({
        ...result.order,
        accessToken: result.accessToken,
        ...(payment ? { payment } : {}),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        if (error.issues.some((issue) => issue.path[0] === 'personalDataConsent')) {
          return response
            .status(400)
            .json({ error: 'PERSONAL_DATA_CONSENT_REQUIRED' });
        }
        return response.status(400).json({ error: 'INVALID_ORDER' });
      }
      if (error instanceof DomainError) {
        const status = error.code === 'LEGAL_VERSION_OUTDATED' ? 409 : 422;
        return response.status(status).json({
          error: error.code,
          details: error.details,
        });
      }
      if (error instanceof PaymentProviderError) {
        return response.status(error.status).json({
          error: error.code,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      throw error;
    }
  });

  return router;
};
