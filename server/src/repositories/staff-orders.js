import { canTransition } from '../domain/status-machine.js';

export const createStaffOrdersRepository = (pool) => ({
  listActive: async () => {
    const result = await pool.query(
      `select o.*,
        coalesce(json_agg(oi order by oi.id) filter (where oi.id is not null), '[]') as items
       from orders o
       left join order_items oi on oi.order_id = o.id
       where o.payment_status = 'paid'
         and o.status not in ('completed', 'cancelled')
       group by o.id
       order by o.created_at`,
    );
    return result.rows;
  },

  transitionStatus: async ({ orderId, status, version, account, reason }) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const currentResult = await client.query(
        'select id, status, version, fulfillment from orders where id = $1 for update',
        [orderId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query('rollback');
        return null;
      }
      if (current.version !== version) {
        await client.query('rollback');
        return { conflict: true, currentVersion: current.version };
      }
      if (!canTransition(current.status, status, account.role)) {
        await client.query('rollback');
        return { forbidden: true };
      }
      if (status === 'cancelled' && !String(reason).trim()) {
        await client.query('rollback');
        return { forbidden: true };
      }

      const updatedResult = await client.query(
        `update orders
         set status = $2, version = version + 1, updated_at = now()
         where id = $1
         returning id, public_number, status, fulfillment, payment_status,
                   version, eta_min, eta_max, updated_at`,
        [orderId, status],
      );
      const updated = updatedResult.rows[0];
      await client.query(
        `insert into status_history (
          order_id, previous_status, new_status, actor_id, actor_name, reason
        ) values ($1, $2, $3, $4, $5, $6)`,
        [
          orderId,
          current.status,
          status,
          account.id,
          account.displayName,
          String(reason).trim(),
        ],
      );
      await client.query(
        `insert into event_outbox (aggregate_type, aggregate_id, event_type, payload)
         values ('order', $1, 'order.updated', $2)`,
        [orderId, updated],
      );
      await client.query('commit');
      return updated;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },
});
