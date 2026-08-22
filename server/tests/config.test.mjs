import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

test('push is disabled cleanly when all VAPID settings are absent', () => {
  const config = loadConfig({ NODE_ENV: 'development' });

  assert.deepEqual(config.push, {
    enabled: false,
    publicKey: '',
    privateKey: '',
    subject: '',
    pollMs: 2_000,
  });
});

test('an incomplete VAPID key pair is rejected', () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'development',
        VAPID_PUBLIC_KEY: 'public-only',
      }),
    /VAPID/i,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'development',
        VAPID_PUBLIC_KEY: 'public',
        VAPID_PRIVATE_KEY: 'private',
      }),
    /VAPID/i,
  );
});

test('a complete VAPID configuration enables push with a bounded poll interval', () => {
  const config = loadConfig({
    NODE_ENV: 'development',
    VAPID_PUBLIC_KEY: 'public',
    VAPID_PRIVATE_KEY: 'private',
    VAPID_SUBJECT: 'mailto:admin@pivdoner.ru',
    PUSH_POLL_MS: '3500',
  });

  assert.deepEqual(config.push, {
    enabled: true,
    publicKey: 'public',
    privateKey: 'private',
    subject: 'mailto:admin@pivdoner.ru',
    pollMs: 3_500,
  });
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'development',
        VAPID_PUBLIC_KEY: 'public',
        VAPID_PRIVATE_KEY: 'private',
        VAPID_SUBJECT: 'mailto:admin@pivdoner.ru',
        PUSH_POLL_MS: '100',
      }),
    /PUSH_POLL_MS/i,
  );
});
