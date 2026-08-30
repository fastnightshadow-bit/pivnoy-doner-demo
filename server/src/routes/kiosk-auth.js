import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { KIOSK_SESSION_COOKIE } from '../auth/kiosk-session.js';
import { authenticateKioskRequest } from '../auth/kiosk-middleware.js';

const activationSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  displayName: z.string().trim().min(2).max(80),
}).strict();

export const createKioskAuthRouter = ({ authService, nodeEnv }) => {
  const router = Router();
  router.post(
    '/activate',
    rateLimit({
      windowMs: 10 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'TOO_MANY_ACTIVATION_ATTEMPTS' },
    }),
    async (request, response) => {
      const parsed = activationSchema.safeParse(request.body);
      if (!parsed.success) {
        return response.status(400).json({ error: 'INVALID_KIOSK_ACTIVATION' });
      }
      const result = await authService.activate(
        parsed.data.code,
        parsed.data.displayName,
      );
      if (!result) {
        return response.status(401).json({ error: 'KIOSK_ACTIVATION_DENIED' });
      }
      response.cookie(KIOSK_SESSION_COOKIE, result.token, {
        httpOnly: true,
        secure: nodeEnv === 'production',
        sameSite: 'strict',
        path: '/',
        expires: result.expiresAt,
      });
      return response.json({
        authenticated: true,
        device: {
          id: result.device.id,
          displayName: result.device.displayName,
        },
      });
    },
  );

  router.get(
    '/session',
    authenticateKioskRequest(authService),
    (request, response) => {
      if (!request.kioskDevice) {
        return response.status(401).json({ authenticated: false });
      }
      return response.json({
        authenticated: true,
        device: request.kioskDevice,
      });
    },
  );

  return router;
};
