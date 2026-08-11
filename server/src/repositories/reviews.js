import { randomUUID } from 'node:crypto';
import { LEGAL_VERSIONS } from '../../../shared/legal.js';

const DEFAULT_AUTHOR_NAME = 'Покупатель';

const mapReview = (row) => ({
  id: row.id,
  orderId: row.order_id,
  authorName: row.customer_name || DEFAULT_AUTHOR_NAME,
  rating: Number(row.rating),
  comment: row.comment || '',
  published: Boolean(row.published),
  publicationConsentAt: row.publication_consent_at ?? null,
  publicationConsentVersion: row.publication_consent_version ?? null,
  publicationRevokedAt: row.publication_revoked_at ?? null,
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
    const publicationConsent =
      draft.publicationConsent === true &&
      draft.publicationConsentVersion === LEGAL_VERSIONS.reviewPublication;
    const authorName =
      String(draft.authorName || '').trim() || DEFAULT_AUTHOR_NAME;
    const client = await pool.connect();
    try {
      await client.query('begin');
      const orderResult = await client.query(
        'select id, status from orders where id = $1 for update',
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
          id, order_id, customer_name, rating, comment, published,
          publication_consent_at, publication_consent_version
        ) values (
          $1, $2, $3, $4, $5, $6,
          case when $6 then now() else null end, $7
        )
        on conflict (order_id) do nothing
        returning *`,
        [
          randomUUID(),
          orderId,
          authorName,
          draft.rating,
          String(draft.comment || '').trim(),
          publicationConsent,
          publicationConsent ? LEGAL_VERSIONS.reviewPublication : null,
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

  unpublish: async (id, revokedAt) => {
    const result = await pool.query(
      `update reviews
       set published = false,
           publication_revoked_at = $2
       where id = $1
       returning *`,
      [id, revokedAt],
    );
    return result.rows[0] ? mapReview(result.rows[0]) : null;
  },
});
