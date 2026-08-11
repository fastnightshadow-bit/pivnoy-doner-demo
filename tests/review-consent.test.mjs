import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_VERSIONS } from '../shared/legal.js';
import { createReview } from '../review-state.js';
import { createReviewService } from '../review-service.js';
import * as orderScreen from '../order.js';
import { readText } from './helpers.mjs';

test('review publication consent is optional and defaults to false', () => {
  const review = createReview({
    orderId: 'o1',
    rating: 5,
    comment: 'Вкусно',
  });

  assert.equal(review.publicationConsent, false);
  assert.equal(review.published, false);
});

test('review is published only with explicit publication consent', () => {
  const review = createReview({
    orderId: 'o1',
    rating: 5,
    publicationConsent: true,
  });

  assert.equal(review.publicationConsent, true);
  assert.equal(review.published, true);
});

test('review service always sends consent and versions only checked consent', async () => {
  const submissions = [];
  const service = createReviewService({
    api: {
      submitReview: async (...args) => {
        submissions.push(args);
        return { id: `review-${submissions.length}` };
      },
    },
  });

  await service.submit(
    { orderId: 'o1', rating: 4, publicationConsent: false },
    'secret-token',
  );
  await service.submit(
    { orderId: 'o2', rating: 5, publicationConsent: true },
    'secret-token',
  );

  assert.deepEqual(submissions[0], [
    'o1',
    {
      rating: 4,
      authorName: 'Покупатель',
      comment: '',
      publicationConsent: false,
    },
    'secret-token',
  ]);
  assert.deepEqual(submissions[1], [
    'o2',
    {
      rating: 5,
      authorName: 'Покупатель',
      comment: '',
      publicationConsent: true,
      publicationConsentVersion: LEGAL_VERSIONS.reviewPublication,
    },
    'secret-token',
  ]);
});

test('completed-order review offers unchecked optional publication consent', () => {
  const html = readText('order.html');
  const checkbox = html.match(/<input[^>]*data-review-publication-consent[^>]*>/)?.[0];

  assert.ok(checkbox);
  assert.doesNotMatch(checkbox, /\b(?:checked|required)\b/);
  assert.match(
    html,
    /Вы решаете, публиковать ли отзыв на главной/,
  );
  assert.match(
    html,
    /Разрешаю опубликовать моё имя и текст отзыва на сайте\.\s*<a href="review-consent\.html"[^>]*>Подробнее<\/a>/,
  );
  assert.match(html, /data-review-success-message/);
});

test('review success message distinguishes public and private feedback', () => {
  assert.equal(
    orderScreen.getReviewSuccessMessage?.(true),
    'Спасибо — отзыв опубликован на главной',
  );
  assert.equal(
    orderScreen.getReviewSuccessMessage?.(false),
    'Спасибо — отзыв отправлен ресторану',
  );
});

test('duplicate review submission uses the persisted publication state', async () => {
  const lookups = [];
  const reviewService = {
    submit: async () => {
      const error = new Error('duplicate review');
      error.code = 'ALREADY_REVIEWED';
      throw error;
    },
    findByOrderId: async (orderId, accessToken) => {
      lookups.push({ orderId, accessToken });
      return { id: 'review-1', published: true };
    },
  };

  const published = await orderScreen.submitReviewAndResolvePublication?.({
    reviewService,
    draft: {
      orderId: 'order-1',
      rating: 5,
      publicationConsent: false,
    },
    accessToken: 'secret-token',
  });

  assert.equal(published, true);
  assert.deepEqual(lookups, [
    { orderId: 'order-1', accessToken: 'secret-token' },
  ]);
});

test('order publication checkbox uses the defined order accent token', () => {
  const css = readText('client-theme.css');
  const rule = css.match(
    /\.order-review__publication input\s*\{[^}]*\}/s,
  )?.[0] ?? '';

  assert.match(rule, /accent-color:\s*var\(--order-accent\);/);
  assert.doesNotMatch(rule, /var\(--color-brand\)/);
});
