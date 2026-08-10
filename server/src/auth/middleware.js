import { SESSION_COOKIE } from './session.js';

export const authenticateRequest = (authService) => async (
  request,
  _response,
  next,
) => {
  request.account = await authService.authenticate(request.cookies?.[SESSION_COOKIE]);
  next();
};

export const requireRole = (...roles) => (request, response, next) => {
  if (!request.account) return response.status(401).json({ error: 'UNAUTHORIZED' });
  if (!roles.includes(request.account.role)) {
    return response.status(403).json({ error: 'FORBIDDEN' });
  }
  return next();
};
