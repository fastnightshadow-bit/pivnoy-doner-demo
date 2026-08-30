import { randomUUID } from 'node:crypto';
import { assertCatalogAvailability } from '../domain/catalog-availability.js';
import { DomainError } from '../domain/errors.js';
import { priceOrder } from '../domain/pricing.js';
import { LEGAL_VERSIONS } from '../../../shared/legal.js';

export const createKioskOrderService = ({
  orders,
  settings,
  catalogSettings,
  createId = randomUUID,
  now = () => new Date(),
}) => ({
  create: async (input, idempotencyKey, device) => {
    if (
      input.personalDataConsent !== true ||
      input.personalDataConsentVersion !== LEGAL_VERSIONS.personalDataConsent ||
      input.offerVersion !== LEGAL_VERSIONS.offer
    ) {
      throw new DomainError('LEGAL_VERSION_OUTDATED');
    }

    const existing = await orders.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (
        existing.source !== 'kiosk' ||
        existing.kioskDeviceId !== device.id
      ) throw new DomainError('IDEMPOTENCY_KEY_CONFLICT');
      const order = await orders.findById(existing.id);
      if (!order) throw new DomainError('ORDER_NOT_FOUND');
      return { order, created: false };
    }

    const catalog = await catalogSettings.get();
    assertCatalogAvailability(input.items, catalog);
    const priced = priceOrder(
      { fulfillment: 'pickup', items: input.items },
      settings,
    );
    const createdAt = now().toISOString();

    try {
      const order = await orders.create({
        id: createId(),
        idempotencyKey,
        status: 'submitted',
        paymentStatus: 'pending',
        source: 'kiosk',
        serviceMode: input.serviceMode,
        kioskDeviceId: device.id,
        customerName: '',
        phone: String(input.fiscalPhone || '').trim(),
        address: {},
        customerComment: '',
        courierComment: '',
        eta: { min: 8, max: 12 },
        version: 1,
        createdAt,
        personalDataConsentAt: createdAt,
        personalDataConsentVersion: input.personalDataConsentVersion,
        offerVersion: input.offerVersion,
        accessTokenHash: null,
        ...priced,
      });
      return { order, created: true };
    } catch (error) {
      if (error?.code !== '23505') throw error;
      const concurrent = await orders.findByIdempotencyKey(idempotencyKey);
      if (
        !concurrent ||
        concurrent.source !== 'kiosk' ||
        concurrent.kioskDeviceId !== device.id
      ) throw new DomainError('IDEMPOTENCY_KEY_CONFLICT');
      const order = await orders.findById(concurrent.id);
      if (!order) throw error;
      return { order, created: false };
    }
  },
});
