import { getReviewSummary } from './review-state.js?v=2026081402';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatReviewDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const getReviewCountLabel = (count) => {
  const normalized = Math.max(0, Number(count) || 0);
  const mod100 = normalized % 100;
  const mod10 = normalized % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${normalized} отзывов`;
  if (mod10 === 1) return `${normalized} отзыв`;
  if (mod10 >= 2 && mod10 <= 4) return `${normalized} отзыва`;
  return `${normalized} отзывов`;
};

export const createReviewCardMarkup = (review = {}) => {
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 1));
  const stars = `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
  const authorName = String(review.authorName ?? '').trim() || 'Покупатель';
  const comment = String(review.comment ?? '').trim();
  const date = formatReviewDate(review.createdAt);

  return `
    <article class="review-card">
      <header class="review-card__header">
        <strong>${escapeHtml(authorName)}</strong>
        ${date ? `<time datetime="${escapeHtml(review.createdAt)}">${escapeHtml(date)}</time>` : ''}
      </header>
      <span class="review-card__stars" aria-label="Оценка ${rating} из 5">${stars}</span>
      ${comment ? `<p>${escapeHtml(comment)}</p>` : '<p class="review-card__muted">Без комментария</p>'}
    </article>
  `;
};

export const createReviewsSectionMarkup = (reviews = []) => {
  const validReviews = (Array.isArray(reviews) ? reviews : []).filter(
    (review) =>
      review?.published !== false &&
      Number.isInteger(Number(review?.rating)) &&
      Number(review.rating) >= 1 &&
      Number(review.rating) <= 5,
  );

  if (!validReviews.length) {
    return `
      <div class="reviews-empty">
        <strong>Пока нет отзывов</strong>
        <p>Первый отзыв появится после завершённого заказа.</p>
      </div>
    `;
  }

  const summary = getReviewSummary(validReviews);
  return `
    <div class="reviews-summary" aria-label="Средняя оценка ${summary.average} из 5">
      <strong>${String(summary.average).replace('.', ',')}</strong>
      <span aria-hidden="true">★</span>
      <small>${getReviewCountLabel(summary.count)}</small>
    </div>
    <div class="reviews-list">
      ${validReviews.map(createReviewCardMarkup).join('')}
    </div>
  `;
};
