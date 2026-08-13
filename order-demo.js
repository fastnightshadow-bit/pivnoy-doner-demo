import { createOrderSnapshot } from './order-state.js';
import {
  loadActiveOrder,
  saveActiveOrder,
} from './order-storage.js?v=2026081402';

export const REVIEW_DEMO_ORDER_ID = 'demo-review-order';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export const isReviewDemoRequest = (search = '') =>
  new URLSearchParams(String(search)).get('demo') === 'review';

export const canUseReviewDemo = ({ hostname = '', search = '' } = {}) => {
  const normalizedHost = String(hostname).trim().toLowerCase();
  if (LOCAL_HOSTS.has(normalizedHost)) return true;
  return (
    normalizedHost === 'fastnightshadow-bit.github.io' &&
    isReviewDemoRequest(search)
  );
};

export const createReviewDemoOrder = ({ now = new Date() } = {}) =>
  createOrderSnapshot({
    lines: [
      {
        lineId: 'demo-classic-1',
        productId: 'shawarma-classic-chicken',
        name: 'Классическая шаурма',
        quantity: 1,
        unitPrice: 350,
        meat: 'Курица',
        size: 'Стандарт',
        addons: ['Сыр'],
      },
    ],
    summary: { items: 350, discount: 0, total: 350 },
    fulfillment: 'pickup',
    payment: 'card',
    customerName: 'Покупатель',
    previousOrder: { id: REVIEW_DEMO_ORDER_ID, number: '7777' },
    now,
  });

export const ensureReviewDemoOrder = ({
  storage,
  hostname = '',
  search = '',
  now = new Date(),
} = {}) => {
  const current = loadActiveOrder(storage);
  if (
    !canUseReviewDemo({ hostname, search }) ||
    !isReviewDemoRequest(search)
  ) {
    return current;
  }
  if (current?.id === REVIEW_DEMO_ORDER_ID) return current;
  return saveActiveOrder(storage, createReviewDemoOrder({ now }));
};
