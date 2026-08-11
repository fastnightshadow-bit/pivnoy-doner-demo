import { randomUUID } from 'node:crypto';
import {
  deriveOrderAccessToken,
  hashOrderAccessToken,
  verifyOrderAccessToken,
} from '../domain/order-access.js';
import { DomainError } from '../domain/errors.js';
import { priceOrder } from '../domain/pricing.js';
import { toPublicClientOrder } from '../domain/public-order.js';
import { LEGAL_VERSIONS } from '../../../shared/legal.js';

export const createOrderService = ({
  orders,
  settings,
  createId = randomUUID,
  now = () => new Date(),
  orderAccessSecret = '',
}) => {
  const verifyAccess = async (id, token) => {
    if (typeof token !== 'string' || token.length === 0) {
      throw new DomainError('ORDER_ACCESS_REQUIRED');
    }
    const order = await orders.findById(String(id));
    if (!order) throw new DomainError('ORDER_NOT_FOUND');
    if (!verifyOrderAccessToken(token, order.accessTokenHash)) {
      throw new DomainError('ORDER_ACCESS_DENIED');
    }
    return order;
  };

  return {
    get: (id) => orders.findById(id),
    verifyAccess,
    getPublic: async (id, token) =>
      toPublicClientOrder(await verifyAccess(id, token)),
    create: async (input, idempotencyKey) => {
      if (
        input.personalDataConsentVersion !==
          LEGAL_VERSIONS.personalDataConsent ||
        input.offerVersion !== LEGAL_VERSIONS.offer
      ) {
        throw new DomainError('LEGAL_VERSION_OUTDATED');
      }

      const existing = await orders.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          order: existing,
          created: false,
          accessToken: deriveOrderAccessToken({
            orderId: existing.id,
            idempotencyKey,
            secret: orderAccessSecret,
          }),
        };
      }

      const priced = priceOrder(input, settings);
      const createdAt = now().toISOString();
      const id = createId();
      const accessToken = deriveOrderAccessToken({
        orderId: id,
        idempotencyKey,
        secret: orderAccessSecret,
      });
      try {
        const order = await orders.create({
          id,
          idempotencyKey,
          status: 'submitted',
          paymentStatus: 'pending',
          customerName: String(input.customer?.name ?? '').trim(),
          phone: String(input.customer?.phone ?? '').trim(),
          address:
            input.address && typeof input.address === 'object'
              ? input.address
              : {},
          customerComment: String(input.comment ?? '').trim(),
          courierComment: String(input.courierComment ?? '').trim(),
          eta: { min: 8, max: 12 },
          version: 1,
          createdAt,
          personalDataConsentAt: createdAt,
          personalDataConsentVersion: input.personalDataConsentVersion,
          offerVersion: input.offerVersion,
          accessTokenHash: hashOrderAccessToken(accessToken),
          ...priced,
        });

        return { order, created: true, accessToken };
      } catch (error) {
        if (error?.code !== '23505') throw error;
        const concurrent = await orders.findByIdempotencyKey(idempotencyKey);
        if (!concurrent) throw error;
        return {
          order: concurrent,
          created: false,
          accessToken: deriveOrderAccessToken({
            orderId: concurrent.id,
            idempotencyKey,
            secret: orderAccessSecret,
          }),
        };
      }
    },
  };
};
