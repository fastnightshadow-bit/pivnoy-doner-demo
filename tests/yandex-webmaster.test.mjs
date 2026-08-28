import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readText } from './helpers.mjs';

test('корень сайта содержит точный файл подтверждения Яндекс Вебмастера', () => {
  const html = readText('yandex_5d45df874506b158.html');

  assert.match(html, /charset=UTF-8/i);
  assert.match(html, /Verification:\s*5d45df874506b158/);
});

test('публичный robots разрешает главную и объявляет Sitemap', () => {
  const robots = readText('robots.txt');

  assert.match(robots, /^User-agent:\s*\*$/m);
  assert.match(robots, /^Allow:\s*\/$/m);
  assert.doesNotMatch(robots, /^Disallow:\s*\/$/m);
  assert.match(robots, /^Disallow:\s*\/api\/$/m);
  assert.match(robots, /^Disallow:\s*\/checkout\.html$/m);
  assert.match(robots, /^Disallow:\s*\/kitchen\.html$/m);
  assert.match(robots, /^Sitemap:\s*https:\/\/pivdoner\.ru\/sitemap\.xml$/m);
});

test('служебные поддомены запрещают поисковый обход', () => {
  assert.equal(existsSync(new URL('../robots-private.txt', import.meta.url)), true);
  const robots = readText('robots-private.txt');

  assert.match(robots, /^User-agent:\s*\*$/m);
  assert.match(robots, /^Disallow:\s*\/$/m);
  assert.doesNotMatch(robots, /^Sitemap:/m);
});

test('Sitemap содержит только публичные канонические страницы', () => {
  assert.equal(existsSync(new URL('../sitemap.xml', import.meta.url)), true);
  const sitemap = readText('sitemap.xml');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.deepEqual(locations, [
    'https://pivdoner.ru/',
    'https://pivdoner.ru/seller.html',
    'https://pivdoner.ru/offer.html',
    'https://pivdoner.ru/privacy.html',
    'https://pivdoner.ru/consent.html',
    'https://pivdoner.ru/review-consent.html',
  ]);
  assert.doesNotMatch(sitemap, /\/(?:cart|checkout|order|kitchen|courier|owner)\.html/);
});

test('страницы из Sitemap объявляют собственные канонические URL', () => {
  const pages = new Map([
    ['home.html', 'https://pivdoner.ru/'],
    ['seller.html', 'https://pivdoner.ru/seller.html'],
    ['offer.html', 'https://pivdoner.ru/offer.html'],
    ['privacy.html', 'https://pivdoner.ru/privacy.html'],
    ['consent.html', 'https://pivdoner.ru/consent.html'],
    ['review-consent.html', 'https://pivdoner.ru/review-consent.html'],
  ]);

  for (const [page, canonicalUrl] of pages) {
    assert.ok(
      readText(page).includes(`<link rel="canonical" href="${canonicalUrl}" />`),
      page,
    );
  }
});
