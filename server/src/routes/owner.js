import { Router } from 'express';
import { z } from 'zod';
import { authenticateRequest, requireRole } from '../auth/middleware.js';

const settingsSchema = z.object({ acceptingOrders: z.boolean() });
const availabilitySchema = z.object({ available: z.boolean() });

export const createOwnerRouter = ({ authService, dashboard, settings = null }) => {
  const router = Router();
  router.use(authenticateRequest(authService));
  router.use(requireRole('owner'));
  router.get('/dashboard', async (_request, response) => {
    response.json(await dashboard.get());
  });
  if (settings) {
    router.patch('/settings', async (request, response) => {
      const parsed = settingsSchema.safeParse(request.body);
      if (!parsed.success) return response.status(400).json({ error: 'INVALID_SETTINGS' });
      response.json(await settings.update(parsed.data, request.account));
    });
    router.patch('/catalog/:id', async (request, response) => {
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
  }
  return router;
};
