import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { createOrdersRepository } from './repositories/orders.js';
import { createOrderService } from './services/orders.js';
import { DEFAULT_ORDER_SETTINGS } from './domain/delivery.js';
import { createAuthRepository } from './repositories/auth.js';
import { createAuthService } from './auth/session.js';
import { createStaffOrdersRepository } from './repositories/staff-orders.js';
import { createEventsRepository } from './repositories/events.js';
import { createStatusService } from './services/statuses.js';
import { createReviewsRepository } from './repositories/reviews.js';
import { createReviewsService } from './services/reviews.js';

const config = loadConfig();

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const db = createPool(config.databaseUrl);
await runMigrations(db);
const orders = createOrdersRepository(db);
const orderService = createOrderService({
  orders,
  settings: DEFAULT_ORDER_SETTINGS,
});
const authService = createAuthService({ repository: createAuthRepository(db) });
const staffOrders = createStaffOrdersRepository(db);
const statusService = createStatusService({ orders: staffOrders });
const events = createEventsRepository(db);
const reviewsService = createReviewsService({
  reviews: createReviewsRepository(db),
});

const server = createApp({
  db,
  orderService,
  authService,
  staffOrders,
  statusService,
  events,
  reviewsService,
  nodeEnv: config.nodeEnv,
}).listen(config.port, '0.0.0.0', () => {
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
