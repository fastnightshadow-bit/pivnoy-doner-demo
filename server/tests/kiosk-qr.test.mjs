import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeKioskQrSvg } from '../src/kiosk/qr.js';

test('киоск создаёт сканируемый SVG только для HTTPS-ссылки оплаты', async () => {
  const svg = await encodeKioskQrSvg(
    'https://yoomoney.ru/checkout/payments/sbp/payment-1',
  );
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox=/);
  assert.doesNotMatch(svg, /<script/i);

  await assert.rejects(
    () => encodeKioskQrSvg('javascript:alert(1)'),
    /KIOSK_QR_URL_INVALID/,
  );
  await assert.rejects(
    () => encodeKioskQrSvg('http://example.test/payment'),
    /KIOSK_QR_URL_INVALID/,
  );
});
