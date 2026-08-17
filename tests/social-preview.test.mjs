import test from 'node:test';
import assert from 'node:assert/strict';
import { readPngDimensions, readText } from './helpers.mjs';

test('главная страница отдаёт фирменное превью для мессенджеров', () => {
  const html = readText('home.html');

  assert.match(html, /<link rel="canonical" href="https:\/\/pivdoner\.ru\/"\s*\/?>/);
  assert.match(html, /<meta property="og:type" content="website"\s*\/?>/);
  assert.match(html, /<meta property="og:site_name" content="Пивной Донер"\s*\/?>/);
  assert.match(html, /<meta property="og:title" content="Пивной Донер — заказать онлайн"\s*\/?>/);
  assert.match(
    html,
    /<meta property="og:description" content="Шаурма, донеры и закуски\. Доставка и самовывоз в Москве\."\s*\/?>/,
  );
  assert.match(html, /<meta property="og:url" content="https:\/\/pivdoner\.ru\/"\s*\/?>/);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/pivdoner\.ru\/assets\/social\/pivnoy-doner-share\.png\?v=2026081701"\s*\/?>/,
  );
  assert.match(html, /<meta property="og:image:width" content="1731"\s*\/?>/);
  assert.match(html, /<meta property="og:image:height" content="909"\s*\/?>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"\s*\/?>/);
  assert.match(
    html,
    /<meta name="twitter:image" content="https:\/\/pivdoner\.ru\/assets\/social\/pivnoy-doner-share\.png\?v=2026081701"\s*\/?>/,
  );
});

test('картинка превью достаточно большая и широкая', () => {
  const dimensions = readPngDimensions('assets/social/pivnoy-doner-share.png');
  const ratio = dimensions.width / dimensions.height;

  assert.deepEqual(dimensions, { width: 1731, height: 909 });
  assert.ok(ratio > 1.8 && ratio < 2, `unexpected ratio: ${ratio}`);
});
