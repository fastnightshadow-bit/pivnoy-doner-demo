import { Router } from 'express';
import { formatSseEvent, getLastEventId, replayEvents } from '../realtime/order-events.js';

export const createEventsRouter = ({ events, pollMs = 1000, heartbeatMs = 20_000 }) => {
  const router = Router();
  router.get('/', async (request, response) => {
    const orderId = String(request.query.orderId ?? '').trim();
    if (!orderId) return response.status(400).json({ error: 'ORDER_ID_REQUIRED' });

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
      const pending = await replayEvents(events, cursor, { orderId });
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
