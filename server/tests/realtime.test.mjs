import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSseEvent,
  getLastEventId,
  replayEvents,
} from '../src/realtime/order-events.js';

test('SSE восстанавливает только события после Last-Event-ID', async () => {
  const events = {
    listAfter: async (lastId) =>
      [
        { id: 4, eventType: 'order.updated', payload: { id: 'order-4' } },
        { id: 5, eventType: 'order.updated', payload: { id: 'order-5' } },
      ].filter(({ id }) => id > lastId),
  };

  const replayed = await replayEvents(events, 4);

  assert.deepEqual(replayed.map(({ id }) => id), [5]);
  assert.match(formatSseEvent(replayed[0]), /^id: 5\nevent: order\.updated\ndata:/);
});

test('Last-Event-ID имеет приоритет над query-параметром', () => {
  const request = {
    get: (name) => (name === 'Last-Event-ID' ? '17' : ''),
    query: { after: '9' },
  };

  assert.equal(getLastEventId(request), 17);
});
