import { Router } from 'express';
import { z } from 'zod';
import { authenticateRequest, requireRole } from '../auth/middleware.js';

const settingsSchema = z.object({ acceptingOrders: z.boolean() });
const availabilitySchema = z.object({ available: z.boolean() });

export const createPublicCatalogStatusRouter = ({ settings }) => {
  const router = Router();
  router.get('/', async (_request, response) => {
    const value = await settings.get();
    response.set('Cache-Control', 'no-store');
    response.json({
      acceptingOrders: value.acceptingOrders !== false,
      stoppedProductIds: Array.isArray(value.stoppedProductIds)
        ? value.stoppedProductIds.map(String)
        : [],
    });
  });
  return router;
};

export const createSettingsRouter = ({ authService, settings }) => {
  const router = Router();
  router.use(authenticateRequest(authService));
  router.use(requireRole('owner', 'kitchen'));

  router.get('/', async (_request, response) => {
    response.json(await settings.get());
  });
  router.patch('/', async (request, response) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'INVALID_SETTINGS' });
    response.json(await settings.update(parsed.data, request.account));
  });
  return router;
};

export const createCatalogRouter = ({ authService, settings }) => {
  const router = Router();
  router.use(authenticateRequest(authService));
  router.use(requireRole('owner', 'kitchen'));
  router.patch('/:id', async (request, response) => {
    const parsed = availabilitySchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'INVALID_AVAILABILITY' });
    try {
      response.json(
        await settings.setAvailability(
          request.params.id,
          parsed.data.available,
          request.account,
        ),
      );
    } catch (error) {
      if (error?.status) return response.status(error.status).json({ error: error.code });
      throw error;
    }
  });
  return router;
};
