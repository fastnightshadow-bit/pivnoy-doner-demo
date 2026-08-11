const PREVIEW_QUERIES = Object.freeze([
  Object.freeze({
    key: 'deliveryDetailsAnonymized',
    sql: `select count(*)::integer as count
          from orders
          where closed_at is not null
            and closed_at <= $1::timestamptz - interval '90 days'
            and (
              address <> '{}'::jsonb
              or customer_comment <> ''
              or courier_comment <> ''
            )`,
  }),
  Object.freeze({
    key: 'customerContactsAnonymized',
    sql: `select count(*)::integer as count
          from orders
          where closed_at is not null
            and closed_at <= $1::timestamptz - interval '3 years'
            and (customer_name <> '' or phone <> '')`,
  }),
  Object.freeze({
    key: 'privateReviewsDeleted',
    sql: `select count(*)::integer as count
          from reviews r
          join orders o on o.id = r.order_id
          where o.closed_at is not null
            and r.published = false
            and r.publication_consent_at is null
            and r.publication_revoked_at is null
            and r.created_at <= $1::timestamptz - interval '1 year'`,
  }),
  Object.freeze({
    key: 'revokedReviewsDeleted',
    sql: `select count(*)::integer as count
          from reviews r
          join orders o on o.id = r.order_id
          where o.closed_at is not null
            and r.published = false
            and r.publication_consent_at is not null
            and r.publication_revoked_at is not null
            and r.publication_revoked_at <= $1::timestamptz - interval '3 years'`,
  }),
  Object.freeze({
    key: 'expiredSessionsDeleted',
    sql: `select count(*)::integer as count
          from sessions
          where expires_at <= $1::timestamptz`,
  }),
  Object.freeze({
    key: 'staffActorsAnonymized',
    sql: `select count(*)::integer as count
          from status_history sh
          join orders o on o.id = sh.order_id
          where o.closed_at is not null
            and sh.created_at <= $1::timestamptz - interval '1 year'
            and sh.previous_status is not null
            and (
              sh.actor_id is not null
              or sh.actor_name <> 'Сотрудник'
            )`,
  }),
  Object.freeze({
    key: 'providerPayloadsCleared',
    sql: `select count(*)::integer as count
          from payments p
          join orders o on o.id = p.order_id
          where o.closed_at is not null
            and p.status in ('paid', 'failed', 'refunded')
            and p.updated_at <= $1::timestamptz - interval '30 days'
            and p.provider_payload <> '{}'::jsonb`,
  }),
]);

const APPLY_QUERIES = Object.freeze([
  Object.freeze({
    key: 'deliveryDetailsAnonymized',
    sql: `update orders
          set address = '{}'::jsonb,
              customer_comment = '',
              courier_comment = ''
          where closed_at is not null
            and closed_at <= $1::timestamptz - interval '90 days'
            and (
              address <> '{}'::jsonb
              or customer_comment <> ''
              or courier_comment <> ''
            )`,
  }),
  Object.freeze({
    key: 'customerContactsAnonymized',
    sql: `update orders
          set customer_name = '',
              phone = ''
          where closed_at is not null
            and closed_at <= $1::timestamptz - interval '3 years'
            and (customer_name <> '' or phone <> '')`,
  }),
  Object.freeze({
    key: 'privateReviewsDeleted',
    sql: `delete from reviews r
          using orders o
          where o.id = r.order_id
            and o.closed_at is not null
            and r.published = false
            and r.publication_consent_at is null
            and r.publication_revoked_at is null
            and r.created_at <= $1::timestamptz - interval '1 year'`,
  }),
  Object.freeze({
    key: 'revokedReviewsDeleted',
    sql: `delete from reviews r
          using orders o
          where o.id = r.order_id
            and o.closed_at is not null
            and r.published = false
            and r.publication_consent_at is not null
            and r.publication_revoked_at is not null
            and r.publication_revoked_at <= $1::timestamptz - interval '3 years'`,
  }),
  Object.freeze({
    key: 'expiredSessionsDeleted',
    sql: `delete from sessions
          where expires_at <= $1::timestamptz`,
  }),
  Object.freeze({
    key: 'staffActorsAnonymized',
    sql: `update status_history sh
          set actor_id = null,
              actor_name = 'Сотрудник'
          from orders o
          where o.id = sh.order_id
            and o.closed_at is not null
            and sh.created_at <= $1::timestamptz - interval '1 year'
            and sh.previous_status is not null
            and (
              sh.actor_id is not null
              or sh.actor_name <> 'Сотрудник'
            )`,
  }),
  Object.freeze({
    key: 'providerPayloadsCleared',
    sql: `update payments p
          set provider_payload = '{}'::jsonb
          from orders o
          where o.id = p.order_id
            and o.closed_at is not null
            and p.status in ('paid', 'failed', 'refunded')
            and p.updated_at <= $1::timestamptz - interval '30 days'
            and p.provider_payload <> '{}'::jsonb`,
  }),
]);

export const createRetentionRepository = (pool) => {
  const previewRetention = async (now) => {
    const counts = {};

    for (const { key, sql } of PREVIEW_QUERIES) {
      const result = await pool.query(sql, [now]);
      counts[key] = Number(result.rows[0]?.count ?? 0);
    }

    return counts;
  };

  const applyRetention = async (now) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const counts = {};

      for (const { key, sql } of APPLY_QUERIES) {
        const result = await client.query(sql, [now]);
        counts[key] = Number(result.rowCount ?? 0);
      }

      await client.query('commit');
      return counts;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  };

  return { previewRetention, applyRetention };
};
