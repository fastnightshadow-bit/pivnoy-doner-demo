import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createHealthRouter } from './routes/health.js';
import { createOrdersRouter } from './routes/orders.js';
import { createAuthRouter } from './routes/auth.js';
import { createStaffOrdersRouter } from './routes/staff-orders.js';
import { createEventsRouter } from './routes/events.js';

export const createApp = ({
  db,
  orderService = null,
  authService = null,
  staffOrders = null,
  statusService = null,
  events = null,
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
  if (events) app.use('/api/events', createEventsRouter({ events }));
  if (orderService) app.use('/api/orders', createOrdersRouter({ orderService }));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'NOT_FOUND' });
  });

  app.use((error, _request, response, _next) => {
    console.error('Unhandled API error', error?.name ?? 'Error');
    response.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  return app;
};
