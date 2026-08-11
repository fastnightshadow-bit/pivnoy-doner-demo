import { Router } from 'express';
import { formatSseEvent, getLastEventId, replayEvents } from '../realtime/order-events.js';
import { SESSION_COOKIE } from '../auth/session.js';

export const canSubscribeToStaffEvents = (account) =>
  ['owner', 'kitchen', 'courier'].includes(account?.role);

export const createEventsRouter = ({
  events,
  authService = null,
  pollMs = 1000,
  heartbeatMs = 20_000,
}) => {
  const router = Router();
  router.get('/', async (request, response) => {
    const staffScope = request.query.scope === 'staff';
    if (!staffScope) {
      return response.status(404).json({ error: 'NOT_FOUND' });
    }
    const account = await authService?.authenticate(
      request.cookies?.[SESSION_COOKIE],
    );
    if (!account) return response.status(401).json({ error: 'UNAUTHORIZED' });
    if (!canSubscribeToStaffEvents(account)) {
      return response.status(403).json({ error: 'FORBIDDEN' });
    }

    response.status(200);
    response.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    response.flushHeaders?.();
    let cursor = getLastEventId(request);
    let closed = false;

    const sendPending = async () => {
      if (closed) return;
      const pending = await replayEvents(events, cursor, {});
      for (const event of pending) {
        response.write(formatSseEvent(event));
        cursor = Math.max(cursor, Number(event.id) || 0);
      }
    };
    await sendPending();
    const poll = setInterval(() => void sendPending(), pollMs);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), heartbeatMs);
    request.on('close', () => {
      closed = true;
      clearInterval(poll);
      clearInterval(heartbeat);
    });
  });
  return router;
};
