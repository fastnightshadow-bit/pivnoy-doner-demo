import { canTransition } from '../domain/status-machine.js';

export const createStaffOrdersRepository = (pool) => ({
  listActive: async () => {
    const result = await pool.query(
      `select
        o.id,
        o.public_number,
        o.status,
        o.fulfillment,
        o.payment_status,
        o.source,
        o.service_mode,
        o.customer_name,
        o.phone,
        o.address,
        o.customer_comment,
        o.courier_comment,
        o.items_total,
        o.delivery_total,
        o.discount_total,
        o.total,
        o.eta_min,
        o.eta_max,
        o.version,
        o.created_at,
        o.updated_at,
        coalesce((
          select json_agg(json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'name', oi.name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'configuration', oi.configuration
          ) order by oi.id)
          from order_items oi
          where oi.order_id = o.id
        ), '[]') as items,
        coalesce((
          select json_agg(json_build_object(
            'from', sh.previous_status,
            'to', sh.new_status,
            'employee', sh.actor_name,
            'at', sh.created_at,
            'reason', sh.reason
          ) order by sh.created_at)
          from status_history sh
          where sh.order_id = o.id
        ), '[]') as history
       from orders o
       where o.payment_status = 'paid'
         and o.status not in ('completed', 'cancelled')
       order by o.created_at`,
    );
    return result.rows;
  },

  listHistory: async ({ query = '', status = 'all', limit = 100 } = {}) => {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 100));
    const result = await pool.query(
      `select
        o.id,
        o.public_number,
        o.status,
        o.fulfillment,
        o.payment_status,
        o.source,
        o.service_mode,
        o.customer_name,
        o.phone,
        o.address,
        o.customer_comment,
        o.courier_comment,
        o.items_total,
        o.delivery_total,
        o.discount_total,
        o.total,
        o.eta_min,
        o.eta_max,
        o.version,
        o.created_at,
        o.updated_at,
        r.status as refund_status,
        coalesce((
          select json_agg(json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'name', oi.name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'configuration', oi.configuration
          ) order by oi.id)
          from order_items oi
          where oi.order_id = o.id
        ), '[]') as items,
        coalesce((
          select json_agg(json_build_object(
            'from', sh.previous_status,
            'to', sh.new_status,
            'employee', sh.actor_name,
            'at', sh.created_at,
            'reason', sh.reason
          ) order by sh.created_at)
          from status_history sh
          where sh.order_id = o.id
        ), '[]') as history
       from orders o
       left join refund_operations r on r.order_id = o.id
       where o.payment_status in ('paid', 'refunded')
         and o.status in ('completed', 'cancelled')
         and (
           $1 = ''
           or o.public_number::text ilike '%' || $1 || '%'
           or o.customer_name ilike '%' || $1 || '%'
           or o.phone ilike '%' || $1 || '%'
         )
         and ($2 = 'all' or o.status::text = $2)
       order by o.closed_at desc
       limit $3`,
      [String(query).trim(), String(status), safeLimit],
    );
    return result.rows;
  },

  findCancellationTarget: async (orderId) => {
    const result = await pool.query(
      `select id, public_number, status, fulfillment, payment_status,
              source, service_mode,
              version, total, updated_at
       from orders
       where id = $1`,
      [orderId],
    );
    return result.rows[0] ?? null;
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
         set status = $2::order_status,
             version = version + 1,
             updated_at = now(),
             closed_at = case
               when $2::order_status in ('completed', 'cancelled') then now()
               else closed_at
             end
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
