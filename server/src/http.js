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
import { createSettingsRepository } from './repositories/settings.js';
import { createSettingsService } from './services/settings.js';
import { createDashboardRepository } from './repositories/dashboard.js';
import { createDashboardService } from './services/dashboard.js';
import { createPaymentsRepository } from './repositories/payments.js';
import { createPaymentService } from './services/payments.js';
import { MockPaymentProvider } from './payments/mock-provider.js';
import { YooKassaPaymentProvider } from './payments/yookassa-provider.js';
import { createPushRepository } from './repositories/push.js';
import { createPushService } from './services/push.js';
import { createPushWorker } from './push/worker.js';
import { createWebPushSender } from './push/web-push-sender.js';

const config = loadConfig();

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const db = createPool(config.databaseUrl);
await runMigrations(db);
const orders = createOrdersRepository(db);
const settingsService = createSettingsService({
  settings: createSettingsRepository(db),
});
const orderService = createOrderService({
  orders,
  settings: DEFAULT_ORDER_SETTINGS,
  catalogSettings: settingsService,
  orderAccessSecret: config.orderAccessSecret,
});
const authService = createAuthService({ repository: createAuthRepository(db) });
const staffOrders = createStaffOrdersRepository(db);
const statusService = createStatusService({ orders: staffOrders });
const events = createEventsRepository(db);
const reviewsService = createReviewsService({
  reviews: createReviewsRepository(db),
});
const dashboardService = createDashboardService({
  dashboard: createDashboardRepository(db),
  settings: settingsService,
});
const paymentProvider =
  config.paymentProvider === 'yookassa'
    ? new YooKassaPaymentProvider({
        shopId: config.yookassaShopId,
        secretKey: config.yookassaSecretKey,
      })
    : new MockPaymentProvider();
const paymentService = createPaymentService({
  payments: createPaymentsRepository(db),
  orders,
  provider: paymentProvider,
  providerName: config.paymentProvider,
  returnUrlForOrder: (orderId) => {
    const url = new URL('/order.html', config.publicBaseUrl);
    url.searchParams.set('id', orderId);
    url.searchParams.set('payment', 'return');
    return url.toString();
  },
});

let pushService = null;
let pushWorker = null;
if (config.push.enabled) {
  const pushRepository = createPushRepository(db);
  pushService = createPushService({
    repository: pushRepository,
    publicKey: config.push.publicKey,
  });
  pushWorker = createPushWorker({
    repository: pushRepository,
    sender: createWebPushSender({
      publicKey: config.push.publicKey,
      privateKey: config.push.privateKey,
      subject: config.push.subject,
    }),
  });
}

const server = createApp({
  db,
  orderService,
  authService,
  staffOrders,
  statusService,
  events,
  reviewsService,
  settingsService,
  dashboardService,
  paymentService,
  pushService,
  nodeEnv: config.nodeEnv,
}).listen(config.port, '0.0.0.0', () => {
  console.log(`Pivdoner API listening on port ${config.port}`);
});

let pushTimer = null;
if (pushWorker) {
  const tick = () =>
    pushWorker.tick().catch((error) => {
      console.error('Courier push worker tick failed', error?.name ?? 'Error');
    });
  void tick();
  pushTimer = setInterval(tick, config.push.pollMs);
  pushTimer.unref?.();
}

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down`);
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
