import { readdir, readFile } from 'node:fs/promises';

const MIGRATION_LOCK = 7_126_404_291;
const migrationsDirectory = new URL('./migrations/', import.meta.url);

export const listMigrations = async () =>
  (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'));

export const runMigrations = async (pool) => {
  const client = await pool.connect();

  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedResult = await client.query(
      'select version from schema_migrations order by version',
    );
    const applied = new Set(appliedResult.rows.map(({ version }) => version));

    for (const version of await listMigrations()) {
      if (applied.has(version)) continue;

      const sql = await readFile(new URL(version, migrationsDirectory), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (version) values ($1)',
          [version],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    } finally {
      client.release();
    }
  }
};
