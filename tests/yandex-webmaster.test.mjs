import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';

test('корень сайта содержит точный файл подтверждения Яндекс Вебмастера', () => {
  const html = readText('yandex_5d45df874506b158.html');

  assert.match(html, /charset=UTF-8/i);
  assert.match(html, /Verification:\s*5d45df874506b158/);
});
