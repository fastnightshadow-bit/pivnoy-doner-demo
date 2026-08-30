import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticateKioskRequest, requireKioskDevice } from '../auth/kiosk-middleware.js';
import { DomainError } from '../domain/errors.js';
import { CATEGORIES, PRODUCTS } from '../../../shared/catalog.js';

const quantitiesSchema = z.record(
  z.string().min(1),
  z.coerce.number().int().min(0).max(5),
);
const lineSchema = z.object({
  productId: z.string().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(20),
  meat: z.string().max(40).optional(),
  size: z.string().max(40).optional(),
  addons: quantitiesSchema.optional(),
  sauces: quantitiesSchema.optional(),
  unitPrice: z.number().optional(),
  name: z.string().optional(),
  lineId: z.string().optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
}).strip();
const orderSchema = z.object({
  serviceMode: z.enum(['dine_in', 'takeaway']),
  fiscalPhone: z.string().trim().min(10).max(32),
  personalDataConsent: z.literal(true),
  personalDataConsentVersion: z.string().min(1).max(40),
  offerVersion: z.string().min(1).max(40),
  items: z.array(lineSchema).min(1).max(50),
}).strict();

const toKioskOrder = (order) => ({
  id: order.id,
  number: order.number,
  status: order.status,
  paymentStatus: order.paymentStatus,
  source: order.source,
  serviceMode: order.serviceMode,
  itemsTotal: order.itemsTotal,
  total: order.total,
  eta: order.eta,
  createdAt: order.createdAt,
  items: order.items,
});

export const createKioskOrdersRouter = ({
  authService,
  orderService,
  settings,
  paymentService = null,
  qrEncoder = null,
}) => {
  const router = Router();
  router.use(authenticateKioskRequest(authService), requireKioskDevice);

  router.get('/bootstrap', async (_request, response) => response.json({
    categories: CATEGORIES,
    products: PRODUCTS,
    settings: await settings.get(),
    serverTime: new Date().toISOString(),
  }));

  router.get('/orders/:id/payment', async (request, response) => {
    if (!paymentService?.getForKiosk) {
      return response.status(503).json({ error: 'PAYMENT_UNAVAILABLE' });
    }
    try {
      const payment = await paymentService.getForKiosk(
        String(request.params.id),
        request.kioskDevice.id,
      );
      return response.json({ payment, serverTime: new Date().toISOString() });
    } catch (error) {
      if (error?.name === 'PaymentProviderError') {
        return response.status(error.status || 502).json({ error: error.code });
      }
      throw error;
    }
  });

  router.post(
    '/orders',
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'TOO_MANY_ORDERS' },
    }),
    async (request, response) => {
      const idempotencyKey = String(request.get('Idempotency-Key') || '').trim();
      if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey)) {
        return response.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY' });
      }
      try {
        const input = orderSchema.parse(request.body);
        const result = await orderService.create(
          input,
          idempotencyKey,
          request.kioskDevice,
        );
        const payment = paymentService
          ? await paymentService.createForKiosk(
              result.order.id,
              `${idempotencyKey}:sbp`,
              request.kioskDevice.id,
            )
          : null;
        const qrSvg = payment?.confirmationUrl && qrEncoder
          ? await qrEncoder(payment.confirmationUrl)
          : '';
        return response.status(result.created ? 201 : 200).json({
          order: toKioskOrder(result.order),
          ...(payment ? { payment, qrSvg } : {}),
          serverTime: new Date().toISOString(),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return response.status(400).json({ error: 'INVALID_KIOSK_ORDER' });
        }
        if (error instanceof DomainError) {
          const status = [
            'IDEMPOTENCY_KEY_CONFLICT',
            'LEGAL_VERSION_OUTDATED',
            'ORDERING_PAUSED',
            'PRODUCT_UNAVAILABLE',
            'PRODUCT_OPTION_UNAVAILABLE',
          ].includes(error.code) ? 409 : 422;
          return response.status(status).json({
            error: error.code,
            details: error.details,
          });
        }
        if (error?.name === 'PaymentProviderError') {
          return response.status(error.status || 502).json({ error: error.code });
        }
        throw error;
      }
    },
  );

  return router;
};
