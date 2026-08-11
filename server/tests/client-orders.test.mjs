import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashOrderAccessToken } from '../src/domain/order-access.js';
import { createOrderService } from '../src/services/orders.js';
import { createReviewsRepository } from '../src/repositories/reviews.js';
import { createReviewsService } from '../src/services/reviews.js';
import { LEGAL_VERSIONS } from '../../shared/legal.js';

const db = { query: async () => ({ rows: [{ ok: 1 }] }) };

const accessToken = 'private-order-access-token';
const internalOrder = Object.freeze({
  id: 'order-1',
  number: '1464',
  status: 'submitted',
  paymentStatus: 'pending',
  fulfillment: 'delivery',
  itemsTotal: 700,
  deliveryTotal: 200,
  discountTotal: 0,
  total: 900,
  eta: { min: 8, max: 12 },
  createdAt: '2026-08-11T12:34:56.000Z',
  customerName: 'Ilya',
  phone: '+79991234567',
  address: { street: 'Secret street', intercom: '42' },
  comment: 'Customer comment',
  customerComment: 'Internal customer comment',
  courierComment: 'Courier comment',
  personalDataConsentAt: '2026-08-11T12:34:56.000Z',
  personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
  offerVersion: LEGAL_VERSIONS.offer,
  accessTokenHash: hashOrderAccessToken(accessToken),
  idempotencyKey: 'private-idempotency-key',
  version: 7,
  history: [{ status: 'submitted', actorName: 'Ilya' }],
  items: [
    {
      lineId: 'line-1',
      productId: 'classic-shawarma',
      name: 'Classic shawarma',
      quantity: 1,
      unitPrice: 700,
      configuration: {
        meat: 'chicken',
        size: 'giant',
        addons: { cheese: 1, comment: 1 },
        sauces: { tasty: 2, 'access-token': 1 },
        comment: 'Future nested comment',
        kitchenConfiguration: { costPrice: 123 },
      },
      comment: 'Current item comment',
      customerComment: 'Future item customer comment',
      accessToken: 'future-item-secret',
      costPrice: 123,
    },
  ],
});

const expectedPublicOrder = Object.freeze({
  id: 'order-1',
  number: '1464',
  status: 'submitted',
  paymentStatus: 'pending',
  fulfillment: 'delivery',
  itemsTotal: 700,
  deliveryTotal: 200,
  discountTotal: 0,
  total: 900,
  eta: { min: 8, max: 12 },
  createdAt: '2026-08-11T12:34:56.000Z',
  items: [
    {
      lineId: 'line-1',
      productId: 'classic-shawarma',
      name: 'Classic shawarma',
      quantity: 1,
      unitPrice: 700,
      meat: 'chicken',
      size: 'giant',
      addons: { cheese: 1 },
      sauces: { tasty: 2 },
    },
  ],
});

const createPublicOrderApp = () =>
  createApp({
    db,
    orderService: createOrderService({
      orders: {
        findById: async (id) => (id === internalOrder.id ? internalOrder : null),
      },
      settings: {},
    }),
  });

const createProtectedReviewApp = ({ submit } = {}) => {
  const calls = [];
  return {
    calls,
    app: createApp({
      db,
      orderService: createOrderService({
        orders: {
          findById: async (id) =>
            id === internalOrder.id ? internalOrder : null,
        },
        settings: {},
      }),
      reviewsService: {
        submit:
          submit ??
          (async (orderId, draft) => {
            calls.push({ operation: 'submit', orderId, draft });
            return { id: 'review-1', orderId, ...draft };
          }),
        list: async () => [],
        findByOrderId: async (orderId) => {
          calls.push({ operation: 'find', orderId });
          return { id: 'review-1', orderId, rating: 5 };
        },
      },
    }),
  };
};

const createReviewConsentApp = () => {
  const queries = [];
  const consentAt = '2026-08-12T09:10:11.000Z';
  const client = {
    query: async (sql, values) => {
      queries.push({ sql: String(sql), values });
      if (/from orders/i.test(String(sql))) {
        return {
          rows: [
            {
              id: internalOrder.id,
              status: 'completed',
              customer_name: 'Private order name',
              phone: '+79991234567',
              address: { street: 'Private street' },
            },
          ],
        };
      }
      if (/insert into reviews/i.test(String(sql))) {
        const published = Boolean(values[5]);
        return {
          rows: [
            {
              id: values[0],
              order_id: values[1],
              customer_name: values[2],
              rating: values[3],
              comment: values[4],
              published,
              publication_consent_at: published ? consentAt : null,
              publication_consent_version: published ? values[6] : null,
              publication_revoked_at: null,
              created_at: consentAt,
            },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  const reviewsService = createReviewsService({
    reviews: createReviewsRepository({ connect: async () => client }),
  });
  return {
    consentAt,
    queries,
    app: createApp({
      db,
      orderService: createOrderService({
        orders: {
          findById: async (id) =>
            id === internalOrder.id
              ? { ...internalOrder, status: 'completed' }
              : null,
        },
        settings: {},
      }),
      reviewsService,
    }),
  };
};

test('order creation returns only the strict public order plus its access token', async () => {
  const app = createApp({
    db,
    orderService: {
      create: async () => ({
        created: true,
        accessToken,
        order: internalOrder,
      }),
    },
  });

  const response = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', 'client-token-1')
    .send({
      fulfillment: 'pickup',
      customer: { phone: '+7 (999) 123-45-67' },
      items: [{ productId: 'nuggets', quantity: 1 }],
      personalDataConsent: true,
      personalDataConsentVersion: LEGAL_VERSIONS.personalDataConsent,
      offerVersion: LEGAL_VERSIONS.offer,
    });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    ...expectedPublicOrder,
    accessToken,
  });
});

test('клиент получает заказ по непредсказуемому идентификатору', async () => {
  const app = createPublicOrderApp();

  const found = await request(app)
    .get('/api/orders/order-1')
    .set('Authorization', `Bearer ${accessToken}`);
  const missing = await request(app)
    .get('/api/orders/missing')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(found.status, 200);
  assert.deepEqual(found.body, expectedPublicOrder);
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'ORDER_NOT_FOUND' });
});

test('public order access without Authorization is rejected', async () => {
  const response = await request(createPublicOrderApp()).get('/api/orders/order-1');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'ORDER_ACCESS_REQUIRED' });
});

test('public order access with the wrong token is rejected', async () => {
  const response = await request(createPublicOrderApp())
    .get('/api/orders/order-1')
    .set('Authorization', 'Bearer wrong-token');

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'ORDER_ACCESS_DENIED' });
});

test('public order access redacts top-level and nested sensitive fields', async () => {
  const response = await request(createPublicOrderApp())
    .get('/api/orders/order-1')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedPublicOrder);
  assert.equal(JSON.stringify(response.body).includes('comment'), false);
  assert.equal(JSON.stringify(response.body).includes('costPrice'), false);
});

test('review access without Authorization is rejected before review operations', async () => {
  for (const method of ['get', 'post']) {
    const { app, calls } = createProtectedReviewApp();
    const pending = request(app)[method]('/api/orders/order-1/review');
    const response =
      method === 'post' ? await pending.send({ rating: 5 }) : await pending;

    assert.equal(response.status, 401, method);
    assert.deepEqual(response.body, { error: 'ORDER_ACCESS_REQUIRED' }, method);
    assert.equal(calls.length, 0, method);
  }
});

test('review access with the wrong token is rejected before review operations', async () => {
  for (const method of ['get', 'post']) {
    const { app, calls } = createProtectedReviewApp();
    const pending = request(app)
      [method]('/api/orders/order-1/review')
      .set('Authorization', 'Bearer wrong-token');
    const response =
      method === 'post' ? await pending.send({ rating: 5 }) : await pending;

    assert.equal(response.status, 403, method);
    assert.deepEqual(response.body, { error: 'ORDER_ACCESS_DENIED' }, method);
    assert.equal(calls.length, 0, method);
  }
});

test('matching order access token allows review lookup and submission', async () => {
  const lookup = createProtectedReviewApp();
  const found = await request(lookup.app)
    .get('/api/orders/order-1/review')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(found.status, 200);
  assert.deepEqual(found.body, {
    id: 'review-1',
    orderId: 'order-1',
    rating: 5,
  });
  assert.deepEqual(lookup.calls, [
    { operation: 'find', orderId: 'order-1' },
  ]);

  const submission = createProtectedReviewApp();
  const created = await request(submission.app)
    .post('/api/orders/order-1/review')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      rating: 4,
      authorName: 'Ilya',
      comment: 'Tasty',
      publicationConsent: false,
    });

  assert.equal(created.status, 201);
  assert.deepEqual(created.body, {
    id: 'review-1',
    orderId: 'order-1',
    rating: 4,
    authorName: 'Ilya',
    comment: 'Tasty',
    publicationConsent: false,
  });
  assert.deepEqual(submission.calls, [
    {
      operation: 'submit',
      orderId: 'order-1',
      draft: {
        rating: 4,
        authorName: 'Ilya',
        comment: 'Tasty',
        publicationConsent: false,
      },
    },
  ]);
});

test('отзыв разрешён только после завершения заказа', async () => {
  const calls = [];
  const app = createApp({
    db,
    orderService: createOrderService({
      orders: {
        findById: async (id) =>
          id === internalOrder.id ? internalOrder : null,
      },
      settings: {},
    }),
    reviewsService: {
      submit: async (orderId, draft) => {
        calls.push({ orderId, draft });
        const error = new Error('ORDER_NOT_COMPLETED');
        error.code = 'ORDER_NOT_COMPLETED';
        error.status = 409;
        throw error;
      },
      list: async () => [],
      findByOrderId: async () => null,
    },
  });

  const response = await request(app)
    .post('/api/orders/order-1/review')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      rating: 5,
      authorName: 'Илья',
      comment: 'Вкусно',
      publicationConsent: false,
    });

  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'ORDER_NOT_COMPLETED');
  assert.equal(calls.length, 1);
});

test('review without publication consent stays private and stores no publication proof', async () => {
  const { app, queries } = createReviewConsentApp();

  const response = await request(app)
    .post('/api/orders/order-1/review')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      rating: 5,
      comment: 'For the restaurant',
      publicationConsent: false,
      publicationConsentVersion: LEGAL_VERSIONS.reviewPublication,
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.published, false);
  assert.equal(response.body.authorName, 'Покупатель');
  assert.equal(response.body.publicationConsentAt, null);
  assert.equal(response.body.publicationConsentVersion, null);

  const orderLookup = queries.find(({ sql }) => /from orders/i.test(sql));
  assert.doesNotMatch(orderLookup.sql, /\b(customer_name|phone|address)\b/i);
  const insert = queries.find(({ sql }) => /insert into reviews/i.test(sql));
  assert.deepEqual(insert.values.slice(1), [
    'order-1',
    'Покупатель',
    5,
    'For the restaurant',
    false,
    null,
  ]);
  assert.doesNotMatch(
    JSON.stringify(insert.values),
    /Private order name|79991234567|Private street/,
  );
});

test('current review publication consent publishes with server time and version', async () => {
  const { app, consentAt, queries } = createReviewConsentApp();

  const response = await request(app)
    .post('/api/orders/order-1/review')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      rating: 4,
      authorName: '  Ilya  ',
      comment: '  Tasty  ',
      publicationConsent: true,
      publicationConsentVersion: LEGAL_VERSIONS.reviewPublication,
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.published, true);
  assert.equal(response.body.authorName, 'Ilya');
  assert.equal(response.body.comment, 'Tasty');
  assert.equal(response.body.publicationConsentAt, consentAt);
  assert.equal(
    response.body.publicationConsentVersion,
    LEGAL_VERSIONS.reviewPublication,
  );
  const insert = queries.find(({ sql }) => /insert into reviews/i.test(sql));
  assert.match(insert.sql, /now\(\)/i);
  assert.deepEqual(insert.values.slice(-2), [
    true,
    LEGAL_VERSIONS.reviewPublication,
  ]);
});

test('true review publication consent rejects stale or missing legal version', async () => {
  for (const publicationConsentVersion of ['2026-01-01', undefined]) {
    const { app, queries } = createReviewConsentApp();
    const payload = {
      rating: 5,
      publicationConsent: true,
      ...(publicationConsentVersion
        ? { publicationConsentVersion }
        : {}),
    };

    const response = await request(app)
      .post('/api/orders/order-1/review')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);

    assert.equal(response.status, 409, String(publicationConsentVersion));
    assert.equal(response.body.error, 'LEGAL_VERSION_OUTDATED');
    assert.equal(
      queries.some(({ sql }) => /insert into reviews/i.test(sql)),
      false,
    );
  }
});

test('reviews repository public list excludes unpublished rows', async () => {
  const rows = [
    {
      id: 'public-review',
      order_id: 'order-1',
      customer_name: 'Public customer',
      rating: 5,
      comment: 'Public',
      published: true,
      created_at: '2026-08-12T09:10:11.000Z',
    },
    {
      id: 'legacy-unconsented-review',
      order_id: 'order-2',
      customer_name: 'Legacy customer',
      rating: 4,
      comment: 'Legacy publication without proof',
      published: false,
      publication_consent_at: null,
      publication_consent_version: null,
      publication_revoked_at: null,
      created_at: '2026-08-12T09:10:10.000Z',
    },
  ];
  const queries = [];
  const repository = createReviewsRepository({
    query: async (sql) => {
      queries.push(String(sql));
      return {
        rows: /where published = true/i.test(String(sql))
          ? rows.filter(({ published }) => published)
          : rows,
      };
    },
  });

  const listed = await repository.list();

  assert.deepEqual(listed.map(({ id }) => id), ['public-review']);
  assert.match(queries[0], /where published = true/i);
});

test('review unpublish atomically revokes publication while preserving consent proof', async () => {
  const queries = [];
  const revokedAt = '2026-08-12T10:11:12.000Z';
  const repository = createReviewsRepository({
    query: async (sql, values) => {
      queries.push({ sql: String(sql), values });
      return {
        rows: [
          {
            id: 'review-1',
            order_id: 'order-1',
            customer_name: 'Ilya',
            rating: 5,
            comment: 'Tasty',
            published: false,
            publication_consent_at: '2026-08-11T12:34:56.000Z',
            publication_consent_version: LEGAL_VERSIONS.reviewPublication,
            publication_revoked_at: revokedAt,
            created_at: '2026-08-11T12:34:56.000Z',
          },
        ],
      };
    },
  });

  const review = await repository.unpublish('review-1', revokedAt);

  assert.equal(review.published, false);
  assert.equal(
    review.publicationConsentAt,
    '2026-08-11T12:34:56.000Z',
  );
  assert.equal(
    review.publicationConsentVersion,
    LEGAL_VERSIONS.reviewPublication,
  );
  assert.equal(review.publicationRevokedAt, revokedAt);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /update reviews[\s\S]*published = false/i);
  assert.match(queries[0].sql, /publication_revoked_at = \$2/i);
  assert.doesNotMatch(queries[0].sql, /delete from reviews/i);
  assert.doesNotMatch(
    queries[0].sql,
    /publication_consent_(?:at|version)\s*=/i,
  );
  assert.deepEqual(queries[0].values, ['review-1', revokedAt]);
});

test('публичная выдача содержит только опубликованные отзывы', async () => {
  const app = createApp({
    db,
    reviewsService: {
      submit: async () => null,
      findByOrderId: async () => null,
      list: async () => [
        { id: 'review-1', rating: 5, published: true },
      ],
    },
  });

  const response = await request(app).get('/api/reviews');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    { id: 'review-1', rating: 5, published: true },
  ]);
});
