import express from 'express';
import helmet from 'helmet';
import { createHealthRouter } from './routes/health.js';
import { createOrdersRouter } from './routes/orders.js';

export const createApp = ({ db, orderService = null }) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use('/api/health', createHealthRouter({ db }));
  if (orderService) app.use('/api/orders', createOrdersRouter({ orderService }));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'NOT_FOUND' });
  });

  return app;
};
