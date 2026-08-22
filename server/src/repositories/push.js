import { randomUUID } from 'node:crypto';

const mapJob = (row) =>
  row
    ? {
        id: row.id,
        payload: row.payload,
        attempts: Number(row.attempts) || 0,
      }
    : null;

export const createPushRepository = (pool, { createId = randomUUID } = {}) => ({
  upsertSubscription: async ({
    accountId,
    endpoint,
    p256dh,
    auth,
    userAgent = '',
  }) => {
    const result = await pool.query(
      `insert into push_subscriptions (
         id, staff_account_id, endpoint, p256dh, auth, user_agent
       ) values ($1, $2, $3, $4, $5, $6)
       on conflict (endpoint) do update
       set staff_account_id = excluded.staff_account_id,
           p256dh = excluded.p256dh,
           auth = excluded.auth,
           user_agent = excluded.user_agent,
           active = true,
           last_error = null,
           updated_at = now()
       returning endpoint`,
      [createId(), accountId, endpoint, p256dh, auth, userAgent],
    );
    return result.rows[0] ?? null;
  },

  deleteSubscription: async (accountId, endpoint) => {
    const result = await pool.query(
      `delete from push_subscriptions
       where staff_account_id = $1 and endpoint = $2`,
      [accountId, endpoint],
    );
    return result.rowCount > 0;
  },

  listActiveCourierSubscriptions: async () => {
    const result = await pool.query(
      `select s.endpoint, s.p256dh, s.auth
       from push_subscriptions s
       join staff_accounts a on a.id = s.staff_account_id
       where s.active = true
         and a.active = true
         and a.role = 'courier'
       order by s.created_at`,
    );
    return result.rows.map((row) => ({
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    }));
  },

  claimNextJob: async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const candidate = await client.query(
        `select id
         from push_jobs
         where (
           status = 'pending' and available_at <= now()
         ) or (
           status = 'sending'
           and claimed_at < now() - interval '2 minutes'
         )
         order by available_at, id
         for update skip locked
         limit 1`,
      );
      const id = candidate.rows[0]?.id;
      if (!id) {
        await client.query('commit');
        return null;
      }
      const claimed = await client.query(
        `update push_jobs
         set status = 'sending',
             attempts = attempts + 1,
             claimed_at = now(),
             updated_at = now()
         where id = $1
         returning id, payload, attempts`,
        [id],
      );
      await client.query('commit');
      return mapJob(claimed.rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },

  markJobSent: async (id) => {
    await pool.query(
      `update push_jobs
       set status = 'sent', sent_at = now(), claimed_at = null,
           last_error = null, updated_at = now()
       where id = $1`,
      [id],
    );
  },

  rescheduleJob: async (id, error, delayMs) => {
    await pool.query(
      `update push_jobs
       set status = 'pending', claimed_at = null, last_error = $2,
           available_at = now() + ($3 * interval '1 millisecond'),
           updated_at = now()
       where id = $1`,
      [id, error, delayMs],
    );
  },

  markJobDead: async (id, error) => {
    await pool.query(
      `update push_jobs
       set status = 'dead', claimed_at = null, last_error = $2,
           updated_at = now()
       where id = $1`,
      [id, error],
    );
  },

  deactivateSubscription: async (endpoint, error) => {
    await pool.query(
      `update push_subscriptions
       set active = false, last_error = $2, updated_at = now()
       where endpoint = $1`,
      [endpoint, error],
    );
  },

  markSubscriptionSuccess: async (endpoint) => {
    await pool.query(
      `update push_subscriptions
       set last_success_at = now(), last_error = null, updated_at = now()
       where endpoint = $1`,
      [endpoint],
    );
  },
});
