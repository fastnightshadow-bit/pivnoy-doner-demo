import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

export const resolveProjectPath = (...segments) => resolve(root, ...segments);

export const readText = (...segments) =>
  readFileSync(resolveProjectPath(...segments), 'utf8');

export const extractJson = (...segments) =>
  JSON.parse(readText(...segments));

export const readPngDimensions = (...segments) => {
  const buffer = readFileSync(resolveProjectPath(...segments));
  assertPng(buffer);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const assertPng = (buffer) => {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('Expected a PNG file');
  }
};
