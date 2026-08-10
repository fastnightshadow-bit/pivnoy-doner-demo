import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { authenticateRequest } from '../auth/middleware.js';
import { SESSION_COOKIE } from '../auth/session.js';

const loginSchema = z.object({
  role: z.enum(['owner', 'kitchen', 'courier']),
  pin: z.string().min(4).max(12),
});

export const createAuthRouter = ({ authService, nodeEnv = 'development' }) => {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) =>
      `${ipKeyGenerator(request.ip)}:${String(request.body?.role ?? '')}`,
  });

  router.post('/login', limiter, async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return response.status(401).json({ error: 'INVALID_LOGIN' });

    const session = await authService.login(parsed.data.role, parsed.data.pin);
    if (!session) return response.status(401).json({ error: 'INVALID_LOGIN' });

    response.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: nodeEnv === 'production',
      sameSite: 'lax',
      expires: session.expiresAt,
      path: '/',
    });
    return response.status(204).end();
  });

  router.post('/logout', async (request, response) => {
    await authService.logout(request.cookies?.[SESSION_COOKIE]);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    return response.status(204).end();
  });

  router.get('/session', authenticateRequest(authService), (request, response) => {
    if (!request.account) {
      return response.json({ authenticated: false, account: null });
    }
    return response.json({ authenticated: true, account: request.account });
  });

  return router;
};
