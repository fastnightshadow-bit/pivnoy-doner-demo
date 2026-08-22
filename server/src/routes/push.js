import { Router } from 'express';
import { z } from 'zod';

import { authenticateRequest, requireRole } from '../auth/middleware.js';

const endpointSchema = z
  .string()
  .url()
  .max(4096)
  .refine((value) => value.startsWith('https://'), 'HTTPS endpoint required');

const subscriptionSchema = z
  .object({
    endpoint: endpointSchema,
    keys: z.object({
      p256dh: z.string().min(1).max(4096),
      auth: z.string().min(1).max(4096),
    }),
  })
  .strict();

const unsubscribeSchema = z.object({ endpoint: endpointSchema }).strict();

export const createPushRouter = ({ authService, pushService }) => {
  const router = Router();
  router.use(authenticateRequest(authService));
  router.use(requireRole('courier', 'owner'));

  router.get('/public-key', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ publicKey: pushService.getPublicKey() });
  });

  router.post('/subscriptions', async (request, response) => {
    const parsed = subscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: 'INVALID_PUSH_SUBSCRIPTION' });
    }
    await pushService.subscribe(
      request.account,
      parsed.data,
      request.get('user-agent') ?? '',
    );
    return response.status(204).end();
  });

  router.delete('/subscriptions', async (request, response) => {
    const parsed = unsubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: 'INVALID_PUSH_SUBSCRIPTION' });
    }
    await pushService.unsubscribe(request.account, parsed.data.endpoint);
    return response.status(204).end();
  });

  return router;
};
