import { Router } from 'express';

export const createReviewsRouter = ({ reviews }) => {
  const router = Router();
  router.get('/', async (_request, response) => {
    response.json(await reviews.list());
  });
  return router;
};
