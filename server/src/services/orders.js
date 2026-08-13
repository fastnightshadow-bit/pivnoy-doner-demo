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
  catalogSettings = null,
  createId = randomUUID,
  now = () => new Date(),
  orderAccessSecret = '',
}) => {
  const recoverIdempotentOrder = async (existing, idempotencyKey) => {
    const order = await orders.findById(existing.id);
    if (!order) throw new DomainError('ORDER_NOT_FOUND');
    const accessToken = deriveOrderAccessToken({
      orderId: order.id,
      idempotencyKey,
      secret: orderAccessSecret,
    });
    if (!verifyOrderAccessToken(accessToken, order.accessTokenHash)) {
      throw new DomainError('ORDER_ACCESS_TOKEN_UNAVAILABLE');
    }
    return { order, created: false, accessToken };
  };

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
        return recoverIdempotentOrder(existing, idempotencyKey);
      }

      if (catalogSettings?.get) {
        const catalog = await catalogSettings.get();
        if (catalog?.acceptingOrders === false) {
          throw new DomainError('ORDERING_PAUSED');
        }
        const stopped = new Set(
          Array.isArray(catalog?.stoppedProductIds)
            ? catalog.stoppedProductIds.map(String)
            : [],
        );
        const productIds = [
          ...new Set(
            input.items
              .map(({ productId }) => String(productId))
              .filter((productId) => stopped.has(productId)),
          ),
        ];
        if (productIds.length > 0) {
          throw new DomainError('PRODUCT_UNAVAILABLE', { productIds });
        }
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
        return recoverIdempotentOrder(concurrent, idempotencyKey);
      }
    },
  };
};
