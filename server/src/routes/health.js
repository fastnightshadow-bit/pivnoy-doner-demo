import { Router } from 'express';

export const createHealthRouter = ({ db }) => {
  if (!db?.query) throw new TypeError('Health route requires a database client');

  const router = Router();

  router.get('/', async (_request, response) => {
    try {
      await db.query('select 1 as ok');
      response.json({ ok: true, database: 'up' });
    } catch {
      response.status(503).json({ ok: false, database: 'down' });
    }
  });

  return router;
};
