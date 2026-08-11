import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createHealthRouter } from './routes/health.js';
import { createOrdersRouter } from './routes/orders.js';
import { createAuthRouter } from './routes/auth.js';
import { createStaffOrdersRouter } from './routes/staff-orders.js';
import { createEventsRouter } from './routes/events.js';
import { createReviewsRouter } from './routes/reviews.js';
import { createCatalogRouter, createSettingsRouter } from './routes/settings.js';
import { createOwnerRouter } from './routes/owner.js';
import { createPaymentsRouter } from './routes/payments.js';

export const createApp = ({
  db,
  orderService = null,
  authService = null,
  staffOrders = null,
  statusService = null,
  events = null,
  reviewsService = null,
  settingsService = null,
  dashboardService = null,
  paymentService = null,
  nodeEnv = 'development',
}) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use('/api/health', createHealthRouter({ db }));
  if (authService) {
    app.use('/api/auth', createAuthRouter({ authService, nodeEnv }));
  }
  if (authService && staffOrders && statusService) {
    app.use(
      '/api/staff/orders',
      createStaffOrdersRouter({
        authService,
        orders: staffOrders,
        statuses: statusService,
      }),
    );
  }
  if (events && authService) {
    app.use('/api/events', createEventsRouter({ events, authService }));
  }
  if (authService && settingsService) {
    app.use(
      '/api/settings',
      createSettingsRouter({ authService, settings: settingsService }),
    );
    app.use(
      '/api/catalog',
      createCatalogRouter({ authService, settings: settingsService }),
    );
  }
  if (authService && dashboardService) {
    app.use(
      '/api/owner',
      createOwnerRouter({
        authService,
        dashboard: dashboardService,
        settings: settingsService,
      }),
    );
  }
  if (reviewsService) {
    app.use('/api/reviews', createReviewsRouter({ reviews: reviewsService }));
  }
  if (paymentService) {
    app.use('/api/payments', createPaymentsRouter({ paymentService }));
  }
  if (orderService) {
    app.use(
      '/api/orders',
      createOrdersRouter({ orderService, reviewsService, paymentService }),
    );
  }

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'NOT_FOUND' });
  });

  app.use((error, _request, response, _next) => {
    console.error('Unhandled API error', error?.name ?? 'Error');
    response.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  return app;
};
