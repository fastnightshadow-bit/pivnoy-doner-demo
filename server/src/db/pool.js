import pg from 'pg';

const { Pool } = pg;

export const createPool = (databaseUrl, options = {}) => {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...options,
  });
};
