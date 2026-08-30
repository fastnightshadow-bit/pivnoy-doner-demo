import { KIOSK_SESSION_COOKIE } from './kiosk-session.js';

export const authenticateKioskRequest = (authService) => async (
  request,
  _response,
  next,
) => {
  request.kioskDevice = await authService.authenticate(
    request.cookies?.[KIOSK_SESSION_COOKIE],
  );
  next();
};

export const requireKioskDevice = (request, response, next) =>
  request.kioskDevice
    ? next()
    : response.status(401).json({ error: 'KIOSK_ACTIVATION_REQUIRED' });
