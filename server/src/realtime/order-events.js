const toEventId = (value) => {
  const id = Math.floor(Number(value) || 0);
  return id > 0 ? id : 0;
};

export const getLastEventId = (request) =>
  toEventId(request.get?.('Last-Event-ID') || request.query?.after);

export const formatSseEvent = ({ id, eventType, payload }) =>
  `id: ${toEventId(id)}\nevent: ${String(eventType || 'message')}\ndata: ${JSON.stringify(payload ?? {})}\n\n`;

export const replayEvents = (events, lastEventId, options = {}) =>
  events.listAfter(toEventId(lastEventId), options);
