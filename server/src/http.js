import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

const config = loadConfig();

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const db = createPool(config.databaseUrl);
await runMigrations(db);

const server = createApp({ db }).listen(config.port, '0.0.0.0', () => {
  console.log(`Pivdoner API listening on port ${config.port}`);
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down`);
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
