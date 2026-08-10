export const createAuthRepository = (pool) => ({
  findActiveAccountByRole: async (role) => {
    const result = await pool.query(
      `select id, display_name, role, pin_hash
       from staff_accounts
       where role = $1 and active = true
       order by created_at
       limit 1`,
      [role],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          displayName: row.display_name,
          role: row.role,
          pinHash: row.pin_hash,
        }
      : null;
  },

  createSession: ({ tokenHash, staffAccountId, expiresAt }) =>
    pool.query(
      `insert into sessions (token_hash, staff_account_id, expires_at)
       values ($1, $2, $3)`,
      [tokenHash, staffAccountId, expiresAt],
    ),

  findSession: async (tokenHash) => {
    const result = await pool.query(
      `select a.id, a.display_name, a.role, s.expires_at
       from sessions s
       join staff_accounts a on a.id = s.staff_account_id
       where s.token_hash = $1 and a.active = true`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          displayName: row.display_name,
          role: row.role,
          expiresAt: row.expires_at,
        }
      : null;
  },

  deleteSession: (tokenHash) =>
    pool.query('delete from sessions where token_hash = $1', [tokenHash]),
});
