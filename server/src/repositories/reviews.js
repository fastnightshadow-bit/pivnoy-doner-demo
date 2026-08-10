import { randomUUID } from 'node:crypto';

const mapReview = (row) => ({
  id: row.id,
  orderId: row.order_id,
  authorName: row.customer_name || 'Покупатель',
  rating: Number(row.rating),
  comment: row.comment || '',
  published: Boolean(row.published),
  verified: true,
  createdAt: row.created_at,
});

export const createReviewsRepository = (pool) => ({
  list: async () => {
    const result = await pool.query(
      `select * from reviews
       where published = true
       order by created_at desc
       limit 100`,
    );
    return result.rows.map(mapReview);
  },

  findByOrderId: async (orderId) => {
    const result = await pool.query(
      'select * from reviews where order_id = $1',
      [orderId],
    );
    return result.rows[0] ? mapReview(result.rows[0]) : null;
  },

  createForCompletedOrder: async (orderId, draft) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const orderResult = await client.query(
        'select id, status, customer_name from orders where id = $1 for update',
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) {
        await client.query('rollback');
        return { missing: true };
      }
      if (order.status !== 'completed') {
        await client.query('rollback');
        return { notCompleted: true };
      }
      const result = await client.query(
        `insert into reviews (
          id, order_id, customer_name, rating, comment, published
        ) values ($1, $2, $3, $4, $5, true)
        on conflict (order_id) do nothing
        returning *`,
        [
          randomUUID(),
          orderId,
          String(draft.authorName || order.customer_name || 'Покупатель').trim(),
          draft.rating,
          String(draft.comment || '').trim(),
        ],
      );
      if (!result.rows[0]) {
        await client.query('rollback');
        return { duplicate: true };
      }
      await client.query('commit');
      return { review: mapReview(result.rows[0]) };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },
});
