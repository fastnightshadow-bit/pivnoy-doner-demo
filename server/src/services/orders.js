import { randomUUID } from 'node:crypto';
import { priceOrder } from '../domain/pricing.js';

export const createOrderService = ({
  orders,
  settings,
  createId = randomUUID,
  now = () => new Date(),
}) => ({
  create: async (input, idempotencyKey) => {
    const existing = await orders.findByIdempotencyKey(idempotencyKey);
    if (existing) return { order: existing, created: false };

    const priced = priceOrder(input, settings);
    const createdAt = now().toISOString();
    try {
      const order = await orders.create({
        id: createId(),
        idempotencyKey,
        status: 'submitted',
        paymentStatus: 'pending',
        customerName: String(input.customer?.name ?? '').trim(),
        phone: String(input.customer?.phone ?? '').trim(),
        address:
          input.address && typeof input.address === 'object' ? input.address : {},
        customerComment: String(input.comment ?? '').trim(),
        courierComment: String(input.courierComment ?? '').trim(),
        eta: { min: 8, max: 12 },
        version: 1,
        createdAt,
        ...priced,
      });

      return { order, created: true };
    } catch (error) {
      if (error?.code !== '23505') throw error;
      const concurrent = await orders.findByIdempotencyKey(idempotencyKey);
      if (!concurrent) throw error;
      return { order: concurrent, created: false };
    }
  },
});
