export const createKioskDevicesRepository = (pool) => ({
  saveActivation: async ({ codeHash, createdBy, expiresAt }) => {
    await pool.query(
      `insert into kiosk_activation_codes (
        code_hash, created_by, expires_at
      ) values ($1, $2, $3)
      on conflict (code_hash) do update
      set created_by = excluded.created_by,
          expires_at = excluded.expires_at,
          consumed_at = null,
          created_at = now()`,
      [codeHash, createdBy, expiresAt],
    );
  },

  consumeActivation: async ({ codeHash, now, device }) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const activationResult = await client.query(
        `select code_hash
         from kiosk_activation_codes
         where code_hash = $1
           and consumed_at is null
           and expires_at > $2
         for update`,
        [codeHash, now],
      );
      if (!activationResult.rows[0]) {
        await client.query('rollback');
        return null;
      }
      await client.query(
        `update kiosk_activation_codes
         set consumed_at = $2
         where code_hash = $1`,
        [codeHash, now],
      );
      const deviceResult = await client.query(
        `insert into kiosk_devices (
          id, display_name, session_token_hash, session_expires_at, active
        ) values ($1, $2, $3, $4, true)
        returning id, display_name, session_expires_at, active`,
        [device.id, device.displayName, device.tokenHash, device.expiresAt],
      );
      await client.query('commit');
      const row = deviceResult.rows[0];
      return {
        id: row.id,
        displayName: row.display_name,
        tokenHash: device.tokenHash,
        expiresAt: row.session_expires_at,
        active: row.active,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },

  findActiveByTokenHash: async (tokenHash) => {
    const result = await pool.query(
      `select id, display_name, session_expires_at, active
       from kiosk_devices
       where session_token_hash = $1
         and active = true`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          displayName: row.display_name,
          expiresAt: row.session_expires_at,
          active: row.active,
        }
      : null;
  },

  touch: async (id, at) => {
    await pool.query(
      `update kiosk_devices
       set last_seen_at = $2
       where id = $1 and active = true`,
      [id, at],
    );
  },
});
