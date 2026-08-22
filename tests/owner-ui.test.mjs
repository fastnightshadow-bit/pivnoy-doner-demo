import test from 'node:test';
import assert from 'node:assert/strict';
import { readText } from './helpers.mjs';

test('кнопки возврата владельца используют центрированный CSS-шеврон', () => {
  const html = readText('owner.html');
  const css = readText('owner.css');

  assert.doesNotMatch(html, />\s*‹\s*<\/button>/);
  assert.equal((html.match(/class="owner-back-icon"/g) ?? []).length, 2);
  assert.match(css, /\.owner-back-icon::before/);
  assert.match(css, /rotate\(-45deg\)/);
});
