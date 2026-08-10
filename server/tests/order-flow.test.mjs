import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { canTransition } from '../src/domain/status-machine.js';
import { MockPaymentProvider } from '../src/payments/mock-provider.js';
import { createOrderService } from '../src/services/orders.js';
import { createPaymentService } from '../src/services/payments.js';
import { createStatusService } from '../src/services/statuses.js';

const settings = Object.freeze({
  deliveryPrice: 200,
  freeDeliveryFrom: 2000,
  minimumOrder: 300,
});

const createOrderStore = () => {
  const byId = new Map();
  const byKey = new Map();

  return {
    findById: async (id) => byId.get(id) ?? null,
    findByIdempotencyKey: async (key) => byKey.get(key) ?? null,
    create: async (order) => {
      byId.set(order.id, order);
      byKey.set(order.idempotencyKey, order);
      return order;
    },
    listActive: async () => [...byId.values()].filter(
      (order) => order.paymentStatus === 'paid' &&
        !['completed', 'cancelled'].includes(order.status),
    ),
    transitionStatus: async ({ orderId, status, version, account }) => {
      const current = byId.get(orderId);
      if (!current) return null;
      if (current.version !== version) {
        return { conflict: true, currentVersion: current.version };
      }
      if (!canTransition(current.status, status, account.role)) {
        return { forbidden: true };
      }
      const updated = { ...current, status, version: current.version + 1 };
      byId.set(orderId, updated);
      byKey.set(updated.idempotencyKey, updated);
      return updated;
    },
    markPaid: (orderId) => {
      const current = byId.get(orderId);
      const updated = {
        ...current,
        paymentStatus: 'paid',
        version: current.version + 1,
      };
      byId.set(orderId, updated);
      byKey.set(updated.idempotencyKey, updated);
    },
  };
};

const createPaymentStore = (orders) => {
  const byKey = new Map();
  const byProviderId = new Map();

  return {
    findByIdempotencyKey: async (key) => byKey.get(key) ?? null,
    findByProviderPaymentId: async (id) => byProviderId.get(id) ?? null,
    create: async (payment) => {
      byKey.set(payment.idempotencyKey, payment);
      byProviderId.set(payment.providerPaymentId, payment);
      return payment;
    },
    applyVerifiedState: async ({ providerPaymentId, status }) => {
      const current = byProviderId.get(providerPaymentId);
      if (current.status === status) return { applied: false };
      const updated = { ...current, status };
      byProviderId.set(providerPaymentId, updated);
      byKey.set(updated.idempotencyKey, updated);
      if (status === 'paid') orders.markPaid(current.orderId);
      return { applied: true, orderId: current.orderId, status };
    },
  };
};

const createAuthStub = () => ({
  login: async (role, pin) => pin === '0000'
    ? { token: `${role}-session`, expiresAt: new Date(Date.now() + 60_000) }
    : null,
  authenticate: async (token) => {
    const role = String(token ?? '').replace('-session', '');
    return ['kitchen', 'courier', 'owner'].includes(role)
      ? { id: `${role}-1`, displayName: role, role }
      : null;
  },
  logout: async () => {},
});

test('paid delivery order follows client to kitchen to courier flow', async () => {
  const orders = createOrderStore();
  const provider = new MockPaymentProvider({ createId: () => 'payment-1' });
  const paymentService = createPaymentService({
    payments: createPaymentStore(orders),
    orders,
    provider,
    returnUrlForOrder: (id) => `/order.html?id=${id}`,
  });
  const app = createApp({
    db: { query: async () => ({ rows: [{ ok: 1 }] }) },
    orderService: createOrderService({
      orders,
      settings,
      createId: () => 'order-flow-1',
    }),
    paymentService,
    authService: createAuthStub(),
    staffOrders: orders,
    statusService: createStatusService({ orders }),
  });

  const created = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'integration-order-1')
    .send({
      fulfillment: 'delivery',
      customer: { name: 'Ilya', phone: '+7 (999) 123-45-67' },
      address: { street: 'Test street', house: '1' },
      items: [{ productId: 'nuggets', quantity: 1, sauces: { tasty: 2 } }],
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.total, 500);

  provider.setStatus(created.body.payment.id, 'succeeded');
  const webhook = await request(app)
    .post('/api/payments/webhook')
    .send({ event: 'payment.succeeded', object: { id: created.body.payment.id } });
  assert.equal(webhook.status, 200);
  assert.equal(webhook.body.applied, true);

  const kitchen = request.agent(app);
  assert.equal((await kitchen.post('/api/auth/login').send({
    role: 'kitchen', pin: '0000',
  })).status, 204);
  const active = await kitchen.get('/api/staff/orders');
  assert.equal(active.status, 200);
  assert.equal(active.body.orders.length, 1);

  let version = active.body.orders[0].version;
  for (const status of ['accepted', 'cooking', 'ready']) {
    const changed = await kitchen
      .patch(`/api/staff/orders/${created.body.id}/status`)
      .send({ status, version });
    assert.equal(changed.status, 200);
    version = changed.body.version;
  }

  const courier = request.agent(app);
  assert.equal((await courier.post('/api/auth/login').send({
    role: 'courier', pin: '0000',
  })).status, 204);
  for (const status of ['courier', 'delivered']) {
    const changed = await courier
      .patch(`/api/staff/orders/${created.body.id}/status`)
      .send({ status, version });
    assert.equal(changed.status, 200);
    version = changed.body.version;
  }

  const result = await request(app).get(`/api/orders/${created.body.id}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'delivered');
  assert.equal(result.body.paymentStatus, 'paid');
});
