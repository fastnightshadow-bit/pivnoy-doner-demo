import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('фотография товара получает жёсткую внутреннюю рамку и не может выйти за сцену', async () => {
  const css = await read('kiosk-fixes-v3.css');
  assert.match(css, /\.kiosk-sheet-image-stage\s*\{[\s\S]*position:\s*relative/);
  assert.match(css, /\.kiosk-sheet-image-stage img\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /inset:\s*24px 64px 48px/);
  assert.match(css, /width:\s*calc\(100% - 128px\)/);
  assert.match(css, /height:\s*calc\(100% - 72px\)/);
  assert.match(css, /object-fit:\s*contain/);
});
