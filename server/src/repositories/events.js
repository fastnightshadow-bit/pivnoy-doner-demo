export const createEventsRepository = (pool) => ({
  listAfter: async (lastId, { orderId = '' } = {}) => {
    const values = [Math.max(0, Number(lastId) || 0)];
    const orderFilter = orderId ? 'and aggregate_id = $2' : '';
    if (orderId) values.push(orderId);
    const result = await pool.query(
      `select id, event_type, payload
       from event_outbox
       where id > $1 ${orderFilter}
       order by id
       limit 100`,
      values,
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      eventType: row.event_type,
      payload: row.payload,
    }));
  },
});
