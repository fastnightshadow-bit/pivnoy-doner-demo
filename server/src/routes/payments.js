import { Router } from 'express';
import { z } from 'zod';
import { PaymentProviderError } from '../payments/provider.js';

const paymentSchema = z.object({
  orderId: z.string().min(1).max(80),
});

const getIdempotencyKey = (request) =>
  String(request.get('Idempotency-Key') ?? '').trim();

const getOrderAccessToken = (request) => {
  const authorization = String(request.get('Authorization') ?? '').trim();
  return /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1] ?? '';
};

const sendPaymentError = (response, error) => {
  if (error instanceof z.ZodError) {
    return response.status(400).json({ error: 'INVALID_PAYMENT' });
  }
  if (error instanceof PaymentProviderError) {
    return response.status(error.status).json({
      error: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  throw error;
};

export const createPaymentsRouter = ({ paymentService }) => {
  const router = Router();

  router.post('/', async (request, response) => {
    const idempotencyKey = getIdempotencyKey(request);
    if (!/^[a-zA-Z0-9._:-]{8,64}$/.test(idempotencyKey)) {
      return response.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY' });
    }
    try {
      const { orderId } = paymentSchema.parse(request.body);
      const payment = await paymentService.create(
        orderId,
        idempotencyKey,
        getOrderAccessToken(request),
      );
      return response.status(201).json(payment);
    } catch (error) {
      return sendPaymentError(response, error);
    }
  });

  router.post('/webhook', async (request, response) => {
    try {
      const result = await paymentService.handleWebhook(request.body);
      return response.json(result);
    } catch (error) {
      return sendPaymentError(response, error);
    }
  });

  return router;
};
