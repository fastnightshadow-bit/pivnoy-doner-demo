import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

export const resolveProjectPath = (...segments) => resolve(root, ...segments);

export const readText = (...segments) =>
  readFileSync(resolveProjectPath(...segments), 'utf8');

export const extractJson = (...segments) =>
  JSON.parse(readText(...segments));
